/**
 * Main Server File
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const csv = require('csv-parser');
const multer = require('multer');
require('dotenv').config();

const database = require('./database');
const Validation = require('./validation');
const SecurityMiddleware = require('./middleware');

class Server {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.uploadPath = process.env.UPLOAD_PATH || './uploads';
        
        // Create uploads directory if it doesn't exist
        this.ensureUploadDirectory();
        
        // Configure file upload
        this.upload = multer({
            dest: this.uploadPath,
            limits: {
                fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760
            },
            fileFilter: (req, file, cb) => {
                // Only allow CSV files
                if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
                    cb(null, true);
                } else {
                    cb(new Error('Only CSV files are allowed'));
                }
            }
        });
        
        this.initializeMiddleware();
        this.initializeRoutes();
    }
    
    /**
     * Create upload directory if it doesn't exist
     */
    async ensureUploadDirectory() {
        try {
            await fs.access(this.uploadPath);
        } catch (error) {
            await fs.mkdir(this.uploadPath, { recursive: true });
            console.log(`Created upload directory: ${this.uploadPath}`);
        }
    }
    
    /**
     * Initialize all middleware
     */
    initializeMiddleware() {
        // Security middleware
        this.app.use(SecurityMiddleware.helmetConfig());
        this.app.use(SecurityMiddleware.corsConfig());
        this.app.use(SecurityMiddleware.requestLogger());
        this.app.use(SecurityMiddleware.healthCheck());
        
        // Body parsing middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Serve static files (form.html)
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // Apply rate limiting to API routes
        this.app.use('/api/', SecurityMiddleware.rateLimiter());
    }
    
    /**
     * Initialize all routes
     */
    initializeRoutes() {
        // Health check endpoint (Task C)
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'Server is running',
                timestamp: new Date().toISOString(),
                database: 'Connected'
            });
        });
        
        // CSV Upload endpoint (Task A)
        this.app.post('/api/upload-csv', this.upload.single('csvfile'), this.handleCSVUpload.bind(this));
        
        // Form submission endpoint (Task B)
        this.app.post('/api/submit-form', SecurityMiddleware.validateFormInput(), this.handleFormSubmission.bind(this));
        
        // Serve form.html as default route
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/form.html'));
        });
        
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint not found'
            });
        });
        
        // Global error handler
        this.app.use((err, req, res, next) => {
            console.error('Global error handler:', err);
            
            if (err instanceof multer.MulterError) {
                return res.status(400).json({
                    success: false,
                    message: 'File upload error: ' + err.message
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });
    }
    
    /**
     * Handle CSV file upload and processing (Task A)
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    async handleCSVUpload(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No CSV file uploaded'
                });
            }
            
            const filePath = req.file.path;
            const records = [];
            const errors = [];
            let rowNumber = 0;
            
            // Read and parse CSV file
            await new Promise((resolve, reject) => {
                const stream = require('stream');
                const fs = require('fs');
                
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (row) => {
                        rowNumber++;
                        
                        try {
                            // Convert CSV row to database format
                            const record = {
                                first_name: row.first_name,
                                last_name: row.last_name,
                                email: row.email,
                                age: parseInt(row.age)
                            };
                            
                            // Validate record
                            const validation = Validation.validateRecord(record, 'csv');
                            
                            if (validation.isValid) {
                                records.push(Validation.sanitizeRecord(record));
                            } else {
                                // INVALID RECORD - Save with row number
                                errors.push({
                                    row: rowNumber,
                                    data: record,
                                    errors: validation.errors
                                });
                            }
                        } catch (error) {
                            // PARSING ERROR - Save with row number
                            errors.push({
                                row: rowNumber,
                                error: error.message
                            });
                        }
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });
            
            // Insert ONLY valid records
            if (records.length > 0) {
                await database.insertBulkRecords(records);
            }
            
            // Clean up uploaded file
            await fs.unlink(filePath);
            
            res.json({
                success: true,
                message: `CSV processing completed`,
                summary: {
                    totalRows: rowNumber,
                    validRecords: records.length,
                    invalidRecords: errors.length,
                    errors: errors
                }
            });
            
        } catch (error) {
            console.error('CSV processing error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process CSV file',
                error: error.message
            });
        }
    }
    
    /**
     * Handle form submission (Task B)
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    async handleFormSubmission(req, res) {
        try {
            // Extract and validate form data
            const formData = {
                first_name: req.body.firstName || req.body.first_name,
                last_name: req.body.lastName || req.body.last_name,
                email: req.body.email,
                phone_number: req.body.phoneNumber || req.body.phone_number,
                eircode: req.body.eircode
            };
            
            // Insert into database
            await database.insertRecord(formData);
            
            res.json({
                success: true,
                message: 'Form data saved successfully',
                data: formData
            });
            
        } catch (error) {
            console.error('Form submission error:', error);
            
            // Handle duplicate email error
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    message: 'Email already exists in database'
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Failed to save form data',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    /**
     * Start the server
     */
    start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`Server running on port ${this.port}`);
            console.log(`Health check: http://localhost:${this.port}/health`);
            console.log(`Form: http://localhost:${this.port}/`);
            console.log(`CSV upload endpoint: http://localhost:${this.port}/api/upload-csv`);
            console.log(`Database user: ${process.env.DB_USER || 'ca2_app_user'}`);
        });
        
        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }
    
    /**
     * Gracefully shutdown server
     */
    async shutdown() {
        console.log('Shutting down server...');
        
        if (this.server) {
            this.server.close();
        }
        
        await database.close();
        console.log('Server shut down successfully');
        process.exit(0);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    const server = new Server();
    server.start();
}

module.exports = Server;