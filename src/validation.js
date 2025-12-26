/**
 * Data Validation Module
 */

const validator = require('validator');

class Validation {
    /**
     * Validate a single record (for CSV or form)
     * @param {Object} record - Record to validate
     * @param {string} source - 'csv' or 'form'
     * @returns {Object} Validation result
     */
    static validateRecord(record, source = 'form') {
        const errors = [];
        
        // Validate first name
        if (!this.isValidName(record.first_name)) {
            errors.push('First name must contain only letters/numbers and be max 20 characters');
        }
        
        // Validate last name
        if (!this.isValidName(record.last_name)) {
            errors.push('Last name must contain only letters/numbers and be max 20 characters');
        }
        
        // Validate email
        if (!this.isValidEmail(record.email)) {
            errors.push('Invalid email format');
        }
        
        // Source-specific validations
        if (source === 'form') {
            // Phone validation for form
            if (!record.phone_number) {
                errors.push('Phone number is required');
            } else if (!this.isValidPhone(record.phone_number)) {
                errors.push('Phone number must be exactly 10 digits');
            }
            
            // Eircode validation for form
            if (!record.eircode) {
                errors.push('Eircode is required');
            } else if (!this.isValidEircode(record.eircode)) {
                errors.push('Eircode must start with a number and be exactly 6 alphanumeric characters');
            }
        } else if (source === 'csv') {
            // Age validation for CSV - OPTIONAL
            if (record.age && !this.isValidAge(record.age)) {
                errors.push('Age must be a number between 0 and 120');
            }
            // Phone and eircode are optional for CSV (not in CSV format)
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * Validate name (first or last)
     * @param {string} name - Name to validate
     * @returns {boolean} Validation result
     */
    static isValidName(name) {
        if (!name || typeof name !== 'string') return false;
        
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 20) return false;
        
        // Only letters and numbers allowed
        return /^[a-zA-Z0-9]+$/.test(trimmed);
    }
    
    /**
     * Validate email
     * @param {string} email - Email to validate
     * @returns {boolean} Validation result
     */
    static isValidEmail(email) {
        return validator.isEmail(email);
    }
    
    /**
     * Validate phone number
     * @param {string} phone - Phone number to validate
     * @returns {boolean} Validation result
     */
    static isValidPhone(phone) {
        if (!phone) return false; // Required, so empty fails
        
        const cleaned = phone.toString().replace(/\D/g, '');
        return /^\d{10}$/.test(cleaned);
    }
    
    /**
     * Validate eircode
     * @param {string} eircode - Eircode to validate
     * @returns {boolean} Validation result
     */
    static isValidEircode(eircode) {
        if (!eircode) return false; // Required, so empty fails
        
        const cleaned = eircode.trim();
        return /^[0-9][a-zA-Z0-9]{5}$/.test(cleaned);
    }
    
    /**
     * Validate age
     * @param {number|string} age - Age to validate
     * @returns {boolean} Validation result
     */
    static isValidAge(age) {
        const ageNum = parseInt(age);
        return !isNaN(ageNum) && ageNum >= 0 && ageNum <= 120;
    }
    
    /**
     * Sanitize input to prevent XSS
     * @param {string} input - Input to sanitize
     * @returns {string} Sanitized input
     */
    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove HTML tags and trim whitespace
        return input
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>"'&]/g, '') // Remove special characters
            .trim();
    }
    
    /**
     * Sanitize entire record object
     * @param {Object} record - Record to sanitize
     * @returns {Object} Sanitized record
     */
    static sanitizeRecord(record) {
        const sanitized = {};
        
        for (const [key, value] of Object.entries(record)) {
            if (typeof value === 'string') {
                sanitized[key] = this.sanitizeInput(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
}

module.exports = Validation;