-- Add document_path column to excuse_requests table
-- This will store the Cloudinary URL of uploaded medical certificates or supporting documents

ALTER TABLE excuse_requests 
ADD COLUMN document_path VARCHAR(512) DEFAULT NULL
COMMENT 'Cloudinary URL of uploaded medical certificate or supporting document';

-- Add index for faster queries
CREATE INDEX idx_excuse_requests_document ON excuse_requests(document_path);
