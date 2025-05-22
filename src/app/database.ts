"use server"

import sqlite3 from "sqlite3";
import { customerTable, orderTable } from "./consants";

const db = new sqlite3.Database('":memory:"');

export const seed = async () => {
    db.serialize(() => {
        db.run(customerTable);
        db.run(orderTable);
    });

    db.run(`
REPLACE INTO 'customer' ('id', 'email', 'name')  
VALUES  
    (1, 'lucas.bill@example.com', 'Lucas Bill'),  
    (2, 'mandy.jones@example.com', 'Mandy Jones'),  
    (3, 'salim.ali@example.com', 'Salim Ali'),  
    (4, 'jane.xiu@example.com', 'Jane Xiu'),  
    (5, 'john.doe@example.com', 'John Doe'),  
    (6, 'jane.smith@example.com', 'Jane Smith'),  
    (7, 'sandeep.bhushan@example.com', 'Sandeep Bhushan'),  
    (8, 'george.han@example.com', 'George Han'),  
    (9, 'asha.kumari@example.com', 'Asha Kumari'),  
    (10, 'salma.khan@example.com', 'Salma Khan');
    `);

    db.run(`
REPLACE INTO 'order' ('id', 'createdate', 'shippingcost', 'customerid', 'carrier', 'trackingid')
VALUES
    (1, '2024-08-05', 3, 4, '', ''),
    (2, '2024-08-02', 3, 6, '', ''),
    (3, '2024-08-04', 1, 10, '', ''),
    (4, '2024-08-03', 2, 8, '', ''),
    (5, '2024-08-10', 2, 10, '', ''),
    (6, '2024-08-01', 3, 3, '', ''),
    (7, '2024-08-02', 1, 4, '', ''),
    (8, '2024-08-04', 3, 2, '', ''),
    (9, '2024-08-07', 3, 8, '', ''),
    (10, '2024-08-09', 1, 9, '', ''),
    (11, '2024-08-07', 2, 7, '', ''),
    (12, '2024-08-03', 3, 9, '', ''),
    (13, '2024-08-06', 3, 5, '', ''),
    (14, '2024-08-01', 2, 2, '', ''),
    (15, '2024-08-05', 1, 3, '', ''),
    (16, '2024-08-02', 2, 5, '', ''),
    (17, '2024-08-03', 1, 7, '', ''),
    (18, '2024-08-06', 1, 6, '', ''),
    (19, '2024-08-04', 2, 1, '', ''),
    (20, '2024-08-01', 1, 1, '', '');    
    `);

}

export const execute = async (sql : string) => {
    return await new Promise((resolve, reject) => {
        try {
            db.all(sql, (error, result) => {
                if (error) resolve(JSON.stringify(error));

                resolve(result);
            })
        } catch (e) {
            console.log(e);
            reject(e);
        }
    })
} 

// "use server"
// import sqlite3 from "sqlite3";
// import fs from "fs";
// import path from "path";

// const dbConnections = new Map<string, sqlite3.Database>();

// const uploadsDir = path.join(process.cwd(), "uploads");
// if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
// }

// export const saveUploadedDatabase = async (file: File): Promise<{
//     success: boolean;
//     dbId: string;
//     error?: string;
// }> => {
//     try {
//         const bytes = await file.arrayBuffer();
//         const buffer = Buffer.from(bytes);

//         const dbId = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
//         const filePath = path.join(uploadsDir, `${dbId}.db`);

//         fs.writeFileSync(filePath, buffer);

//         await validateDatabase(dbId, filePath);

//         return { success: true, dbId };
//     } catch (error) {
//         console.error("Error Saving Database:", error);
//         return {
//             success: false,
//             dbId: "",
//             error: error.message,
//         }
//     };
// }

// const validateDatabase = async (dbId: string, filePath: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//         const testDb = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
//             if (err) {
//                 reject(new Error("Invalid SQLite database file"));
//                 return;
//             }

//             testDb.all(`SELECT name FROM sqlite_master WHERE type="table"`, (err, tables) => {
//                 testDb.close();
//                 if (err) {
//                     reject(new Error("Unable to read database structure"));
//                 }
//                 else {
//                     resolve();
//                 }
//             });
//         });
//     });
// };

// const initDB = (dbId: string): sqlite3.Database => {
//     if (!dbConnections.has(dbId)) {
//         const filePath = path.join(uploadsDir, `${dbId}.db`);

//         if (!fs.existsSync(filePath)) {
//             throw new Error(`Database file not found for ID: ${dbId}.db`);
//         }

//         const db = new sqlite3.Database(filePath, sqlite3.OPEN_READWRITE, (err) => {
//             if (err) {
//                 console.error("Error opening database", err);
//                 throw err;
//             }

//             console.log("Connected to database", dbId);
//         });

//         dbConnections.set(dbId, db);
//     }

//     return dbConnections.get(dbId)!;
// }

// export const getSchema = async (dbId: string): Promise<any> => {
//     return new Promise((resolve, reject) => {
//         try {
//             const database = initDB(dbId);

//             // Get all table names
//             database.all(
//                 "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
//                 (err, tables) => {
//                     if (err) {
//                         reject(err);
//                         return;
//                     }

//                     const schema: any = {};
//                     let completed = 0;

//                     if (tables.length === 0) {
//                         resolve(schema);
//                         return;
//                     }

//                     // Get column information for each table
//                     tables.forEach((table: any) => {
//                         database.all(
//                             `PRAGMA table_info("${table.name}")`,
//                             (err, columns) => {
//                                 if (err) {
//                                     reject(err);
//                                     return;
//                                 }

//                                 schema[table.name] = columns.map((col: any) => ({
//                                     name: col.name,
//                                     type: col.type,
//                                     nullable: !col.notnull,
//                                     primaryKey: col.pk === 1
//                                 }));

//                                 completed++;
//                                 if (completed >= tables.length) {
//                                     resolve(schema);
//                                 }
//                             }
//                         );
//                     });
//                 }
//             );
//         } catch (error) {
//             reject(error);
//         }
//     });
// };

// export const execute = async (dbId: string, sql: string) => {
//     return new Promise((resolve, reject) => {
//         try {
//             const database = initDB(dbId);
//             database.all(sql, (error, result) => {
//                 if (error) {
//                     console.log("SQL execution error: ", error);
//                     resolve(error.message);
//                 }
//                 else {
//                     resolve(result);
//                 }
//             });
//         } catch (error) {
//             console.log("Database Error: ", error);
//             reject(error);
//         }
//     });
// };

// export const getTables = async (dbId: string): Promise<string[]> => {
//     return new Promise((resolve, reject) => {
//         try {
//             const database = initDB(dbId);

//             database.all("SELECT name FROM sqlite_master WHERE type ='table' AND name NOT LIKE 'sqlite_%'",
//                 (err, tables) => {
//                     if (err) reject(err);

//                     else resolve(tables.map((table: any) => table.name));
//                 }
//             );
//         } catch (error) {
//             reject(error);
//         }
//     });
// }

// export const getDatabaseInfo = async (dbId: string): Promise<{ id: string; tables: string[]; tableCount: number }> => {
//     try {
//         const tables = await getTables(dbId);
//         return {
//             id: dbId,
//             tables,
//             tableCount: tables.length
//         };
//     } catch (error) {
//         throw error;
//     }
// };

// export const listUploadedDatabases = async (): Promise<string[]> => {
//     try {
//         const files = fs.readdirSync(uploadsDir);
//         return files
//             .filter(file => file.endsWith('.db'))
//             .map(file => file.replace('.db', ''));
//     } catch (error) {
//         console.error('Error listing databases:', error);
//         return [];
//     }
// };

// export const closeDB = (dbId: string) => {
//     const db = dbConnections.get(dbId) ; 
//     if(db){
//         db.close((err)=>{
//             if(err) console.error(`Error Closing Database: ${dbId}`, err);

//             else console.log(`Database connection closed: ${dbId}`); 
//         });
//     }
// }

// export const closeAllDBs = () => {
//     for ( const [dbId, db] of dbConnections.entries()){
//         db.close();
//     }
//     dbConnections.clear() ; 
// }

// export const deleteDatabase = async (dbId: string): Promise<boolean> => {
//     try {
//         closeDB(dbId);
//         const filePath = path.join(uploadsDir, `${dbId}.db`);
//         if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//             return true;
//         }
//         return false;
//     } catch (error) {
//         console.error('Error deleting database:', error);
//         return false;
//     }
// };