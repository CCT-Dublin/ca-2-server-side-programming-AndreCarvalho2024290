/**
 * Database Connection Module
 * Handles secure connection to MySQL database with connection pooling
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
    constructor() {
        // Create connection pool for better performance and connection management
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'ca2_app_user',          // Application user
            password: process.env.DB_PASSWORD || 'Pass1234!',     // Application password
            database: process.env.DB_NAME || 'ca2_database',
            waitForConnections: true,
            connectionLimit: 10, // Maximum number of connections in pool
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });

        this.initializeDatabase();
    }

    /**
     * Initialize database and verify table exists
     */
    async initializeDatabase() {
        try {
            const connection = await this.pool.getConnection();
            
            // Just verify the table exists instead of trying to create it
            // The table should be created by running schema.sql with root user
            const [tables] = await connection.execute(
                "SHOW TABLES LIKE 'mysql_table'"
            );
            
            if (tables.length === 0) {
                console.error('Table mysql_table does not exist!');
                console.error('   Please run: mysql -u root -p < sql/schema.sql');
                throw new Error('Database table not found. Run schema.sql first.');
            }
            
            console.log('Database table verified successfully');
            
            connection.release();
        } catch (error) {
            // Check if it's a permission error (which is expected)
            if (error.code === 'ER_TABLEACCESS_DENIED_ERROR') {
                console.log('Database connection established');
                console.log('  (Table creation skipped - requires admin privileges)');
                return;
            }
            
            console.error('Database initialization failed:', error.message);
            
            // Provide more helpful error messages
            if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                console.error('   Username/Password might be incorrect. Check your .env file');
                console.error('   Current user:', process.env.DB_USER || 'ca2_app_user (default)');
                console.error('   Current password:', process.env.DB_PASSWORD ? '******' : 'Pass1234! (default)');
            } else if (error.code === 'ER_BAD_DB_ERROR') {
                console.error('   Database might not exist. Run schema.sql first');
                console.error('   Command: mysql -u root -p < sql/schema.sql');
            }
            
            throw error;
        }
    }

    /**
     * Get a connection from the pool
     * @returns {Promise} Database connection
     */
    async getConnection() {
        return await this.pool.getConnection();
    }

    /**
     * Execute a query with parameters
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise} Query result
     */
    async execute(sql, params = []) {
        try {
            const [results] = await this.pool.execute(sql, params);
            return results;
        } catch (error) {
            console.error('Database query error:', error.message);
            
            // Log SQL for debugging in development mode
            if (process.env.NODE_ENV === 'development') {
                console.error('   SQL:', sql);
                console.error('   Params:', params);
            }
            
            throw error;
        }
    }

    /**
     * Insert a record into mysql_table
     * @param {Object} data - Record data
     * @returns {Promise} Insert result
     */
    async insertRecord(data) {
        const sql = `
            INSERT INTO mysql_table 
            (first_name, last_name, email, phone_number, eircode, age) 
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            phone_number = VALUES(phone_number),
            eircode = VALUES(eircode),
            age = VALUES(age)
        `;
        
        const params = [
            data.first_name,
            data.last_name,
            data.email,
            data.phone_number || null,
            data.eircode || null,
            data.age || null
        ];

        return await this.execute(sql, params);
    }

    /**
     * Insert multiple records in a transaction
     * @param {Array} records - Array of record objects
     * @returns {Promise} Bulk insert result
     */
    async insertBulkRecords(records) {
        const connection = await this.getConnection();
        
        try {
            await connection.beginTransaction();
            
            const sql = `
                INSERT INTO mysql_table 
                (first_name, last_name, email, age) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                age = VALUES(age)
            `;
            
            for (const record of records) {
                await connection.execute(sql, [
                    record.first_name,
                    record.last_name,
                    record.email,
                    record.age || null
                ]);
            }
            
            await connection.commit();
            return { success: true, count: records.length };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Close database connections
     */
    async close() {
        try {
            await this.pool.end();
            console.log('Database connections closed');
        } catch (error) {
            console.error('Error closing database connections:', error);
        }
    }
}

// Export singleton instance
module.exports = new Database();