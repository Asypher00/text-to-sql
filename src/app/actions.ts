// "use server"

// import { ChatWatsonx } from "@langchain/community/chat_models/ibm";
// import { createReactAgent } from "@langchain/langgraph/prebuilt";
// import { tool } from "@langchain/core/tools";
// import { z } from "zod";
// import { mapStoredMessagesToChatMessages, StoredMessage } from "@langchain/core/messages";
// import { execute } from "./database"
// import { customerTable, orderTable } from "./consants";
// export const message = async (messages: StoredMessage[]) => {
//     const deserialized = mapStoredMessagesToChatMessages(messages);

//     const getFromDB = tool(
//         async (input) => {
//             if (input?.sql) {
//                 const result = await execute(input.sql);
//                 console.log({ result, sql: input.sql })
//             }
//             return null;
//         },
//         {
//             name: "get_from_db",
//             description: `Get data from a database, the database has a following schema:
//             ${orderTable}
//             ${customerTable}
//             `,
//             schema: z.object({
//                 sql: z
//                     .string()
//                     .describe("SQL query to get datafrom a aSQL database. Put quotes around the field and table names."),
//             }),
//         }
//     )

//     const agent = createReactAgent({
//         llm: new ChatWatsonx({
//             model: "ibm/granite-3-8b-instruct",
//             projectId: process.env.WATSONX_AI_PROJECT_ID,
//             serviceUrl: process.env.WATSONX_AI_ENDPOINT,
//             version: "2024-05-31",
//         }),
//         tools: [getFromDB],
//     });

//     const response = await agent.invoke({
//         messages: deserialized
//     });

//     return response.messages[response.messages.length - 1].content;
// }


"use server"

import { ChatWatsonx } from "@langchain/community/chat_models/ibm";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { mapStoredMessagesToChatMessages, StoredMessage } from "@langchain/core/messages";
import { execute, getDatabaseSchema, initializeConnection, testConnection, getConnectionStatus, closeConnection } from "./database";

// Database connection configuration interface
export interface DatabaseConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
}

// Action to connect to database
export const connectToDatabase = async (config: DatabaseConfig): Promise<{ success: boolean; message: string; schema?: string }> => {
  try {
    // First test the connection
    const testResult = await testConnection(config);
    
    if (!testResult.success) {
      return { success: false, message: `Connection test failed: ${testResult.message}` };
    }

    // Initialize the connection
    const connected = await initializeConnection(config);
    
    if (connected) {
      try {
        const schema = await getDatabaseSchema();
        return { 
          success: true, 
          message: `Successfully connected to database "${config.database}" on server "${config.server}"`,
          schema 
        };
      } catch (schemaError) {
        return {
          success: true,
          message: `Connected to database but couldn't retrieve schema: ${schemaError.message}`,
          schema: "Schema information unavailable"
        };
      }
    } else {
      return { success: false, message: 'Failed to initialize database connection' };
    }
  } catch (error) {
    console.error('Database connection error:', error);
    return { success: false, message: `Connection failed: ${error.message}` };
  }
};

// Action to get connection status
export const getDbConnectionStatus = async () => {
  return getConnectionStatus();
};

// Action to disconnect from database
export const disconnectFromDatabase = async (): Promise<{ success: boolean; message: string }> => {
  try {
    await closeConnection();
    return { success: true, message: 'Disconnected from database successfully' };
  } catch (error) {
    return { success: false, message: `Error disconnecting: ${error.message}` };
  }
};

// Main message processing function
export const message = async (messages: StoredMessage[]) => {
  try {
    const deserialized = mapStoredMessagesToChatMessages(messages);
    
    // Check if database is connected
    const connectionStatus = await getConnectionStatus();
    
    if (!connectionStatus.connected) {
      return "❌ Please connect to a database first before asking questions. Use the 'Connect Database' button to establish a connection.";
    }

    // Get current database schema
    let currentSchema = "";
    try {
      currentSchema = await getDatabaseSchema();
    } catch (error) {
      console.error("Schema retrieval error:", error);
      return `❌ Error retrieving database schema: ${error.message}. Please check your database connection and try reconnecting.`;
    }

    const getFromDB = tool(
      async (input) => {
        if (!input?.sql) {
          return JSON.stringify({
            error: "No SQL query provided",
            message: "Please provide a valid SQL query to execute."
          });
        }

        try {
          const result = await execute(input.sql);
          console.log('Query execution result:', { success: result.success, query: input.sql, rowCount: result.data?.length });
          
          if (result.success) {
            const dataCount = result.data?.length || 0;
            const rowsAffected = result.rowsAffected?.[0] || dataCount;
            
            return JSON.stringify({
              data: result.data,
              rowsAffected: rowsAffected,
              success: true,
              query: result.query,
              message: `✅ Query executed successfully. ${dataCount > 0 ? `Returned ${dataCount} rows.` : `${rowsAffected} rows affected.`}`
            });
          } else {
            return JSON.stringify({
              error: result.error,
              success: false,
              query: result.query,
              message: `❌ Query execution failed: ${result.error}`
            });
          }
        } catch (error) {
          console.error('Unexpected error in query execution:', error);
          return JSON.stringify({
            error: error.message,
            success: false,
            message: `❌ An unexpected error occurred: ${error.message}`
          });
        }
      },
      {
        name: "get_from_db",
        description: `Execute SQL queries on the connected SQL Server database. 

Current Database Schema:
${currentSchema}

IMPORTANT SQL Server Guidelines:
- Use TOP N instead of LIMIT N (e.g., "SELECT TOP 10 * FROM table")
- Use square brackets [table_name] for tables/columns with spaces or special characters
- Use proper schema.table notation (e.g., dbo.customers)
- Date functions: GETDATE(), DATEPART(), DATEDIFF(), etc.
- String functions: LEN(), SUBSTRING(), CHARINDEX(), etc.
- Use single quotes for string literals
- For pagination: use OFFSET and FETCH NEXT (SQL Server 2012+)
- Common data types: VARCHAR, NVARCHAR, INT, BIGINT, DECIMAL, DATETIME, BIT

Always generate syntactically correct T-SQL queries based on the actual schema provided above.`,
        schema: z.object({
          sql: z
            .string()
            .describe("A complete, valid SQL Server (T-SQL) query to execute against the connected database. Use the exact table and column names from the schema above. Ensure proper SQL Server syntax."),
        }),
      }
    );

    // Create the agent with enhanced system prompt
    const agent = createReactAgent({
      llm: new ChatWatsonx({
        model: "ibm/granite-3-8b-instruct",
        projectId: process.env.WATSONX_AI_PROJECT_ID,
        serviceUrl: process.env.WATSONX_AI_ENDPOINT,
        version: "2024-05-31",
        temperature: 0.1, // Lower temperature for more consistent SQL generation
      }),
      tools: [getFromDB],
      systemMessage: `You are an expert SQL Server database assistant. Your role is to help users query their SQL Server database using natural language.

CORE RESPONSIBILITIES:
1. Convert natural language questions into accurate T-SQL queries
2. Execute queries using the get_from_db tool
3. Explain results in a clear, user-friendly manner
4. Provide insights and suggestions based on the data

SQL SERVER SYNTAX RULES:
- Use TOP N instead of LIMIT N
- Use SQL Server functions (GETDATE(), LEN(), CHARINDEX(), etc.)
- Use proper table.column notation with square brackets if needed
- Always reference the exact schema provided in the tool description

RESPONSE FORMAT:
- Always use the get_from_db tool to execute queries
- Explain what the query does before showing results
- Format results in a readable way (tables, lists, or summaries)
- If query fails, suggest corrections
- For complex requests, break them down into steps

BEST PRACTICES:
- Start with simple queries to understand the data
- Use meaningful column aliases for calculated fields
- Include appropriate WHERE clauses to filter data
- Use ORDER BY for sorted results
- Consider performance for large datasets

Current database connection: ${connectionStatus.server}/${connectionStatus.database}

Always be helpful, accurate, and provide actionable insights from the data.`
    });

    const response = await agent.invoke({
      messages: deserialized
    });

    return response.messages[response.messages.length - 1].content;
  } catch (error) {
    console.error('Error in message processing:', error);
    return `❌ An error occurred while processing your request: ${error.message}. Please try again or check your database connection.`;
  }
};
