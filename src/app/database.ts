// "use server"

// import sqlite3 from "sqlite3";
// import { customerTable, orderTable } from "./consants";

// const db = new sqlite3.Database('":memory:"');

// export const seed = async () => {
//     db.serialize(() => {
//         db.run(customerTable);
//         db.run(orderTable);
//     });

//     db.run(`
// REPLACE INTO 'customer' ('id', 'email', 'name')  
// VALUES  
//     (1, 'lucas.bill@example.com', 'Lucas Bill'),  
//     (2, 'mandy.jones@example.com', 'Mandy Jones'),  
//     (3, 'salim.ali@example.com', 'Salim Ali'),  
//     (4, 'jane.xiu@example.com', 'Jane Xiu'),  
//     (5, 'john.doe@example.com', 'John Doe'),  
//     (6, 'jane.smith@example.com', 'Jane Smith'),  
//     (7, 'sandeep.bhushan@example.com', 'Sandeep Bhushan'),  
//     (8, 'george.han@example.com', 'George Han'),  
//     (9, 'asha.kumari@example.com', 'Asha Kumari'),  
//     (10, 'salma.khan@example.com', 'Salma Khan');
//     `);

//     db.run(`
// REPLACE INTO 'order' ('id', 'createdate', 'shippingcost', 'customerid', 'carrier', 'trackingid')
// VALUES
//     (1, '2024-08-05', 3, 4, '', ''),
//     (2, '2024-08-02', 3, 6, '', ''),
//     (3, '2024-08-04', 1, 10, '', ''),
//     (4, '2024-08-03', 2, 8, '', ''),
//     (5, '2024-08-10', 2, 10, '', ''),
//     (6, '2024-08-01', 3, 3, '', ''),
//     (7, '2024-08-02', 1, 4, '', ''),
//     (8, '2024-08-04', 3, 2, '', ''),
//     (9, '2024-08-07', 3, 8, '', ''),
//     (10, '2024-08-09', 1, 9, '', ''),
//     (11, '2024-08-07', 2, 7, '', ''),
//     (12, '2024-08-03', 3, 9, '', ''),
//     (13, '2024-08-06', 3, 5, '', ''),
//     (14, '2024-08-01', 2, 2, '', ''),
//     (15, '2024-08-05', 1, 3, '', ''),
//     (16, '2024-08-02', 2, 5, '', ''),
//     (17, '2024-08-03', 1, 7, '', ''),
//     (18, '2024-08-06', 1, 6, '', ''),
//     (19, '2024-08-04', 2, 1, '', ''),
//     (20, '2024-08-01', 1, 1, '', '');    
//     `);

// }

// export const execute = async (sql : string) => {
//     return await new Promise((resolve, reject) => {
//         try {
//             db.all(sql, (error, result) => {
//                 if (error) resolve(JSON.stringify(error));

//                 resolve(result);
//             })
//         } catch (e) {
//             console.log(e);
//             reject(e);
//         }
//     })
// } 

"use server"

import sql from 'mssql';

// Configuration interface for database connection
interface DatabaseConfig {
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

// Store the current connection configuration
let currentConfig: DatabaseConfig | null = null;
let connectionPool: sql.ConnectionPool | null = null;

// Initialize connection with provided configuration
export const initializeConnection = async (config: DatabaseConfig): Promise<boolean> => {
  try {
    // Close existing connection if any
    if (connectionPool) {
      await connectionPool.close();
    }

    // Create new connection pool
    const poolConfig: sql.config = {
      server: config.server,
      database: config.database,
      user: config.user,
      password: config.password,
      port: config.port || 1433,
      options: {
        encrypt: config.options?.encrypt ?? true,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    };

    connectionPool = new sql.ConnectionPool(poolConfig);
    await connectionPool.connect();
    
    currentConfig = config;
    console.log('Successfully connected to SQL Server database');
    return true;
  } catch (error) {
    console.error('Failed to connect to database:', error);
    connectionPool = null;
    currentConfig = null;
    return false;
  }
};

// Get database schema information
export const getDatabaseSchema = async (): Promise<string> => {
  if (!connectionPool) {
    throw new Error('Database connection not initialized');
  }

  try {
    const request = new sql.Request(connectionPool);
    
    // Get all tables and their columns
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
          kcu.TABLE_SCHEMA,
          kcu.TABLE_NAME,
          kcu.COLUMN_NAME,
          kcu.REFERENCED_TABLE_NAME,
          kcu.REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      ) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA AND c.TABLE_NAME = fk.TABLE_NAME AND c.COLUMN_NAME = fk.COLUMN_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
    `);

    // Get table row counts
    const countRequest = new sql.Request(connectionPool);
    const countResult = await countRequest.query(`
      SELECT 
        s.name AS schema_name,
        t.name AS table_name,
        p.rows AS row_count
      FROM sys.tables t
      INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
      INNER JOIN sys.partitions p ON t.object_id = p.object_id
      WHERE p.index_id IN (0, 1)
    `);

    // Create a map of table row counts
    const rowCounts = new Map();
    countResult.recordset.forEach(row => {
      const key = `${row.schema_name}.${row.table_name}`;
      rowCounts.set(key, row.row_count);
    });

    // Format schema information
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
      const foreignKey = row.IS_FOREIGN_KEY === 'YES' ? ` [FK -> ${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}]` : '';
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
  } catch (error) {
    console.error('Error getting database schema:', error);
    throw new Error(`Failed to retrieve database schema: ${error.message}`);
  }
};

// Execute SQL query
export const execute = async (sqlQuery: string): Promise<any> => {
  if (!connectionPool) {
    throw new Error('Database connection not initialized. Please connect to a database first.');
  }

  try {
    const request = new sql.Request(connectionPool);
    
    // Set query timeout (30 seconds)
    request.timeout = 30000;
    
    console.log('Executing SQL:', sqlQuery);
    const result = await request.query(sqlQuery);
    
    // Return the recordset (data rows) and additional info
    return {
      data: result.recordset,
      rowsAffected: result.rowsAffected,
      success: true,
      query: sqlQuery
    };
  } catch (error) {
    console.error('SQL execution error:', error);
    return { 
      error: error.message,
      success: false,
      query: sqlQuery
    };
  }
};

// Test database connection
export const testConnection = async (config: DatabaseConfig): Promise<{ success: boolean; message: string }> => {
  try {
    const testPool = new sql.ConnectionPool({
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
    
    // Test a simple query
    const request = new sql.Request(testPool);
    await request.query('SELECT 1 as test');
    
    await testPool.close();
    
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    console.error('Connection test failed:', error);
    return { success: false, message: error.message };
  }
};

// Get current connection status
export const getConnectionStatus = (): { connected: boolean; database?: string; server?: string } => {
  return {
    connected: connectionPool?.connected ?? false,
    database: currentConfig?.database,
    server: currentConfig?.server,
  };
};

// Close database connection
export const closeConnection = async (): Promise<void> => {
  if (connectionPool) {
    try {
      await connectionPool.close();
    } catch (error) {
      console.error('Error closing connection:', error);
    }
    connectionPool = null;
    currentConfig = null;
  }
};