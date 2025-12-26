/**
 * Security Middleware Module
 * Implements security best practices and request handling
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Validation = require('./validation');

class SecurityMiddleware {
    /**
     * Get Helmet configuration for security headers
     * @returns {Function} Helmet middleware
     */
    static helmetConfig() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for form
                    scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for form
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            },
            hsts: {
                maxAge: 31536000, // 1 year
                includeSubDomains: true,
                preload: true
            },
            xFrameOptions: { action: 'deny' }, // Prevent clickjacking
            xContentTypeOptions: { nosniff: true }, // Prevent MIME sniffing
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
        });
    }
    
    /**
     * Rate limiting for API endpoints
     * @returns {Function} Rate limit middleware
     */
    static rateLimiter() {
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Limit each IP to 100 requests per windowMs
            message: {
                error: 'Too many requests from this IP, please try again after 15 minutes'
            },
            standardHeaders: true, // Return rate limit info in headers
            legacyHeaders: false // Disable X-RateLimit headers
        });
    }
    
    /**
     * Input validation middleware for form submissions
     * @returns {Function} Validation middleware
     */
    static validateFormInput() {
        return (req, res, next) => {
            try {
                // Sanitize all input data
                req.body = Validation.sanitizeRecord(req.body);
                
                // Validate required fields
                const requiredFields = ['firstName', 'lastName', 'email', 'phoneNumber', 'eircode'];
                for (const field of requiredFields) {
                    if (!req.body[field]) {
                        return res.status(400).json({
                            success: false,
                            message: `Missing required field: ${field}`
                        });
                    }
                }
                
                // Convert to snake_case for validation
                const formData = {
                    first_name: req.body.firstName || req.body.first_name,
                    last_name: req.body.lastName || req.body.last_name,
                    email: req.body.email,
                    phone_number: req.body.phoneNumber || req.body.phone_number,
                    eircode: req.body.eircode
                };
                
                // Validate data structure
                const validation = Validation.validateRecord(formData, 'form');
                
                if (!validation.isValid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Validation failed',
                        errors: validation.errors
                    });
                }
                
                next();
            } catch (error) {
                console.error('Validation middleware error:', error);
                res.status(500).json({
                    success: false,
                    message: 'Internal server error during validation'
                });
            }
        };
    }
    
    /**
     * Check if server is healthy
     * @returns {Function} Health check middleware
     */
    static healthCheck() {
        return (req, res, next) => {
            // Add health check endpoint
            if (req.path === '/health') {
                return res.status(200).json({
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                });
            }
            next();
        };
    }
    
    /**
     * Log all requests
     * @returns {Function} Logging middleware
     */
    static requestLogger() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
            });
            
            next();
        };
    }
    
    /**
     * CORS configuration
     * @returns {Function} CORS middleware
     */
    static corsConfig() {
        return (req, res, next) => {
            res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'http://localhost:3000');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.header('Access-Control-Allow-Credentials', 'true');
            
            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                return res.status(200).end();
            }
            
            next();
        };
    }
}

module.exports = SecurityMiddleware;