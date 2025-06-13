import sql from 'mssql';

// Define types locally or import from a shared types file
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

// Define the QueryResult interface
export interface QueryResult {
  data: Record<string, unknown>[]; // More specific type instead of any[]
  rowsAffected: number[] | undefined;
  success: boolean;
  query: string;
  error?: string; // Add error property for failed queries
}

// Private variables to hold the connection pool and config
let connectionPool: sql.ConnectionPool | null = null;
let currentConfig: DatabaseConfig | null = null;
let dbSchema: string | null = null; // Store schema once connected

// Function to initialize the connection pool
export const initializeConnection = async (config: DatabaseConfig): Promise<boolean> => {
  if (connectionPool && connectionPool.connected) {
    // If already connected, close the existing one first
    await closeConnection();
  }

  try {
    currentConfig = config;
    connectionPool = new sql.ConnectionPool({
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 1433,
      options: {
        encrypt: config.options?.encrypt ?? true,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
      },
      connectionTimeout: 15000, // 15 seconds
      requestTimeout: 30000, // 30 seconds for requests
    });

    // Event listener for connection errors (important for resilience)
    connectionPool.on('error', err => {
      console.error('MSSQL Pool Error:', err);
      // Depending on the error, you might want to automatically close and nullify the pool
      if (connectionPool && connectionPool.connected) {
         // Optionally, try to close the pool if it's in a bad state
         // connectionPool.close().catch(e => console.error("Error closing pool on error:", e));
      }
      connectionPool = null;
      currentConfig = null;
      dbSchema = null;
    });

    await connectionPool.connect();
    console.log(`Database connected: ${config.database}@${config.server}`);
    
    // Fetch and store schema immediately upon successful connection
    dbSchema = await getDatabaseSchemaInternal();

    return true;
  } catch (error: unknown) {
    console.error('Error initializing database connection:', error);
    connectionPool = null;
    currentConfig = null;
    dbSchema = null;
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    throw new Error(errorMessage); // Re-throw to be caught by API route
  }
};

// Internal function to get schema (used after successful connection)
const getDatabaseSchemaInternal = async (): Promise<string> => {
  if (!connectionPool) {
    throw new Error('Database connection not initialized for schema retrieval.');
  }

  try {
    const request = new sql.Request(connectionPool);
    
    const result = await request.query(`
      SELECT 
        t.TABLE_SCHEMA,
        t.TABLE_NAME,
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.CHARACTER_MAXIMUM_LENGTH,
        c.IS_NULLABLE,
        c.COLUMN_DEFAULT,
        c.ORDINAL_POSITION,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS IS_PRIMARY_KEY,
        CASE WHEN fk.COLUMN_NAME IS NOT NULL THEN 'YES' ELSE 'NO' END AS IS_FOREIGN_KEY,
        fk.REFERENCED_TABLE_SCHEMA,
        fk.REFERENCED_TABLE_NAME,
        fk.REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLES t
      LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
      LEFT JOIN (
        SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA AND c.TABLE_NAME = pk.TABLE_NAME AND c.COLUMN_NAME = pk.COLUMN_NAME
      LEFT JOIN (
        SELECT 
          kcu1.TABLE_SCHEMA,
          kcu1.TABLE_NAME,
          kcu1.COLUMN_NAME,
          kcu2.TABLE_SCHEMA AS REFERENCED_TABLE_SCHEMA,
          kcu2.TABLE_NAME AS REFERENCED_TABLE_NAME,
          kcu2.COLUMN_NAME AS REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu1 
          ON rc.CONSTRAINT_NAME = kcu1.CONSTRAINT_NAME
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2 
          ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME
      ) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA AND c.TABLE_NAME = fk.TABLE_NAME AND c.COLUMN_NAME = fk.COLUMN_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
    `);

    const countRequest = new sql.Request(connectionPool);
    const countResult = await countRequest.query(`
      SELECT 
        s.name AS schema_name,
        t.name AS table_name,
        p.rows AS row_count
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.partitions p ON t.object_id = p.object_id
      WHERE p.index_id IN (0, 1) -- Heap or Clustered Index
    `);

    const rowCounts = new Map<string, number>(); // Explicitly type Map
    countResult.recordset.forEach((row: Record<string, unknown>) => {
      const key = `${row.schema_name}.${row.table_name}`;
      rowCounts.set(key, row.row_count as number);
    });

    let schemaInfo = `Database: ${currentConfig?.database}\nServer: ${currentConfig?.server}\n\n`;
    schemaInfo += "=== DATABASE SCHEMA ===\n\n";
    
    let currentTable = "";
    let tableCount = 0;
    
    for (const row of result.recordset) {
      const fullTableName = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      
      if (currentTable !== fullTableName) {
        if (currentTable !== "") schemaInfo += "\n";
        tableCount++;
        const rowCount = rowCounts.get(fullTableName) || 0;
        schemaInfo += `Table ${tableCount}: ${fullTableName} (${rowCount} rows)\n`;
        schemaInfo += "Columns:\n";
        currentTable = fullTableName;
      }
      
      const nullable = row.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
      const primaryKey = row.IS_PRIMARY_KEY === 'YES' ? ' [PK]' : '';
      const foreignKey = row.IS_FOREIGN_KEY === 'YES' ? ` [FK -> ${row.REFERENCED_TABLE_SCHEMA}.${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}]` : '';
      const maxLength = row.CHARACTER_MAXIMUM_LENGTH ? `(${row.CHARACTER_MAXIMUM_LENGTH})` : '';
      const defaultValue = row.COLUMN_DEFAULT ? ` DEFAULT ${row.COLUMN_DEFAULT}` : '';
      
      schemaInfo += `  - ${row.COLUMN_NAME}: ${row.DATA_TYPE}${maxLength} ${nullable}${defaultValue}${primaryKey}${foreignKey}\n`;
    }

    schemaInfo += `\nTotal Tables: ${tableCount}\n`;
    schemaInfo += "\n=== QUERY GUIDELINES ===\n";
    schemaInfo += "- Use proper SQL Server T-SQL syntax\n";
    schemaInfo += "- Use TOP N instead of LIMIT N\n";
    schemaInfo += "- Use square brackets [table_name] if table/column names have spaces\n";
    schemaInfo += "- Use GETDATE() for current date/time\n";
    schemaInfo += "- Use proper schema.table notation when needed\n";

    return schemaInfo;
  } catch (error: unknown) {
    console.error('Error getting database schema (initial attempt):', error);
    const initialErrorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    // Fallback: Try a simpler schema query if the complex one fails
    try {
      const simpleRequest = new sql.Request(connectionPool);
      const simpleResult = await simpleRequest.query(`
        SELECT 
          t.TABLE_SCHEMA,
          t.TABLE_NAME,
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.CHARACTER_MAXIMUM_LENGTH,
          c.IS_NULLABLE,
          c.COLUMN_DEFAULT,
          c.ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.TABLES t
        INNER JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
      `);

      let schemaInfo = `Database: ${currentConfig?.database}\nServer: ${currentConfig?.server}\n\n`;
      schemaInfo += "=== DATABASE SCHEMA (Basic Fallback) ===\n\n";
      
      let currentTable = "";
      let tableCount = 0;
      
      for (const row of simpleResult.recordset) {
        const fullTableName = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
        
        if (currentTable !== fullTableName) {
          if (currentTable !== "") schemaInfo += "\n";
          tableCount++;
          schemaInfo += `Table ${tableCount}: ${fullTableName}\n`;
          schemaInfo += "Columns:\n";
          currentTable = fullTableName;
        }
        
        const nullable = row.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
        const maxLength = row.CHARACTER_MAXIMUM_LENGTH ? `(${row.CHARACTER_MAXIMUM_LENGTH})` : '';
        const defaultValue = row.COLUMN_DEFAULT ? ` DEFAULT ${row.COLUMN_DEFAULT}` : '';
        
        schemaInfo += `  - ${row.COLUMN_NAME}: ${row.DATA_TYPE}${maxLength} ${nullable}${defaultValue}\n`;
      }

      schemaInfo += `\nTotal Tables: ${tableCount}\n`;
      schemaInfo += "\n=== QUERY GUIDELINES ===\n";
      schemaInfo += "- Use proper SQL Server T-SQL syntax\n";
      schemaInfo += "- Use TOP N instead of LIMIT N\n";
      schemaInfo += "- Use square brackets [table_name] if table/column names have spaces\n";
      schemaInfo += "- Use GETDATE() for current date/time\n";
      schemaInfo += "- Use proper schema.table notation when needed\n";

      return schemaInfo;
    } catch (fallbackError: unknown) {
      console.error('Fallback schema query also failed:', fallbackError);
      const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError); // Type narrowing
      throw new Error(`Failed to retrieve database schema: ${fallbackErrorMessage}. Initial error: ${initialErrorMessage}`);
    }
  }
};

// Exported function to get current schema (simply returns the stored one)
export const getDatabaseSchema = async (): Promise<string> => {
    if (!dbSchema) {
        throw new Error('Database schema not available. Please connect to a database first.');
    }
    return dbSchema;
};


// Execute SQL query
export const execute = async (sqlQuery: string): Promise<QueryResult> => { // Explicitly define return type
  if (!connectionPool || !connectionPool.connected) {
    throw new Error('Database connection not initialized or disconnected. Please connect to a database first.');
  }

  try {
    const request = new sql.Request(connectionPool);
    // Use setTimeout method instead of setting timeout property
    request.setTimeout(30000); // Set query timeout (30 seconds)
    
    console.log('Executing SQL:', sqlQuery);
    const result = await request.query(sqlQuery);
    
    return {
      data: result.recordset,
      rowsAffected: result.rowsAffected,
      success: true,
      query: sqlQuery
    };
  } catch (error: unknown) {
    console.error('SQL execution error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return { 
      error: errorMessage, // Use the typed error message
      success: false,
      query: sqlQuery,
      data: [], // Ensure data is an array
      rowsAffected: undefined // Ensure rowsAffected is defined or undefined
    };
  }
};

// Test database connection (temporary pool for test)
export const testConnection = async (config: DatabaseConfig): Promise<{ success: boolean; message: string }> => {
  let testPool: sql.ConnectionPool | null = null;
  try {
    testPool = new sql.ConnectionPool({
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 1433,
      options: {
        encrypt: config.options?.encrypt ?? true,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
      },
      connectionTimeout: 10000,
    });

    await testPool.connect();
    
    // Test a simple query to ensure it's functional
    const request = new sql.Request(testPool);
    await request.query('SELECT 1 as test');
    
    return { success: true, message: 'Connection successful' };
  } catch (error: unknown) {
    console.error('Connection test failed:', error);
    const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
    return { success: false, message: errorMessage };
  } finally {
    if (testPool) {
      try {
        await testPool.close();
      } catch (closeError: unknown) {
        console.error('Error closing test connection pool:', closeError);
      }
    }
  }
};

// Get current connection status
export const getConnectionStatus = async (): Promise<{ connected: boolean; database?: string; server?: string }> => {
  return {
    connected: connectionPool?.connected ?? false,
    database: currentConfig?.database,
    server: currentConfig?.server,
  };
};

// Close database connection
export const closeConnection = async (): Promise<{ success: boolean; message: string }> => {
  if (connectionPool) {
    try {
      await connectionPool.close();
      connectionPool = null;
      currentConfig = null;
      dbSchema = null; // Clear schema on disconnect
      console.log("Database connection closed.");
      return { success: true, message: 'Disconnected from database successfully' };
    } catch (error: unknown) {
      console.error('Error closing connection:', error);
      const errorMessage = error instanceof Error ? error.message : String(error); // Type narrowing
      return { success: false, message: `Error disconnecting: ${errorMessage}` };
    }
  }
  return { success: true, message: 'No active connection to disconnect.' }; // Already disconnected
};