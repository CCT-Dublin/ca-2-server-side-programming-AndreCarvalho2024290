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
     * Initialize database and create table if it doesn't exist
     */
    async initializeDatabase() {
        try {
            const connection = await this.pool.getConnection();
            
            // Create table
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS mysql_table (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    first_name VARCHAR(50) NOT NULL,
                    last_name VARCHAR(50) NOT NULL,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    phone_number VARCHAR(15),
                    eircode VARCHAR(10),
                    age INT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_email (email),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `;

            await connection.execute(createTableSQL);
            console.log('Database table verified/created successfully');
            
            connection.release();
        } catch (error) {
            console.error('Database initialization failed:', error.message);
            
            // Provide more helpful error messages
            if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                console.error('   Username/Password might be incorrect. Check your .env file');
                console.error('   Current user:', process.env.DB_USER || 'ca2_app_user (default)');
                console.error('   Current password:', process.env.DB_PASSWORD ? '******' : 'Pass1234! (default)');
            } else if (error.code === 'ER_BAD_DB_ERROR') {
                console.error('   Database might not exist. Run sql/schema.sql first');
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
            
            for (const record of records) {
                await this.insertRecord(record);
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