# ADR-001: Amazon S3 for File Storage

**Status:** Accepted
**Date:** 2025-10-31
**Deciders:** Development Team

## Context

Causalytics is a causal analysis platform that requires users to upload CSV datasets for performing Difference-in-Differences (DiD) analysis. The platform needs a reliable, scalable solution for storing user-uploaded files that:

- Handles multiple concurrent file uploads from different users
- Scales storage capacity as the user base grows
- Provides secure access control for file retrieval
- Maintains file metadata and associations with user projects
- Supports files up to 10MB in size
- Ensures durability and availability of uploaded data

The application architecture consists of a Flask backend and React frontend, with PostgreSQL for relational data. We need to decide where and how to store user-uploaded CSV files.

## Decision

We will use **Amazon S3 (Simple Storage Service)** as the file storage backend for all user-uploaded datasets.

### Implementation Details:

1. **S3 Integration via boto3**
   - Use AWS SDK for Python (boto3) to interact with S3
   - Configure S3 client with AWS credentials from environment variables
   - Region configurable via `AWS_REGION` (defaults to `us-east-1`)

2. **File Organization Structure**
   ```
   s3://bucket-name/uploads/project_{project_id}/{uuid}.csv
   ```
   - Files organized by project ID for logical grouping
   - UUID-based filenames prevent naming conflicts and overwrites
   - Original filename preserved in S3 metadata and database

3. **Dual Storage Approach**
   - **S3**: Stores actual file content
   - **PostgreSQL**: Stores file metadata (filename, s3_key, schema_info)
   - Database `Dataset` model maintains reference via unique `s3_key` column

4. **File Validation**
   - CSV format only (validated by file extension)
   - 10MB size limit enforced before upload
   - Content-Type set to `text/csv` during upload

5. **Metadata Storage**
   - S3 object metadata includes:
     - `original-filename`: User's original filename
     - `project-id`: Associated project identifier
     - `uploaded-by`: User ID who uploaded the file
   - PostgreSQL stores: `file_name`, `s3_key`, `schema_info`, `project_id`

6. **Security**
   - AWS credentials stored in environment variables (not in code)
   - JWT authentication required for all upload/access operations
   - Project ownership validated before file operations
   - S3 bucket access controlled via IAM policies

## Consequences

### Positive

- **Scalability**: S3 automatically scales to handle any amount of data without infrastructure management
- **Durability**: 99.999999999% (11 9's) durability ensures data is not lost
- **Cost-Effective**: Pay-per-use model with no upfront costs; cheaper than managing storage infrastructure
- **Performance**: High availability and low latency for file operations globally
- **Separation of Concerns**: File storage separated from application and database servers
- **Reduced Server Load**: Offloads file storage from backend server, freeing resources for computation
- **Built-in Features**: Versioning, lifecycle policies, and encryption available out-of-the-box
- **Developer Experience**: boto3 library is mature, well-documented, and actively maintained

### Negative

- **Vendor Lock-in**: Tightly coupled to AWS ecosystem; migration to other providers requires refactoring
- **External Dependency**: Relies on AWS availability; S3 outages impact file operations
- **Cost Unpredictability**: Costs can increase unexpectedly with high usage (though still typically lower than alternatives)
- **Network Latency**: File operations require network round-trips to AWS, adding latency vs. local storage
- **Complexity**: Additional configuration required (AWS credentials, bucket setup, IAM policies)
- **Testing Challenges**: Requires mocking S3 in tests or using localstack for integration tests
- **Environment Configuration**: Need to manage AWS credentials securely across development, staging, and production

## Alternatives Considered

### 1. Local Filesystem Storage
**Description**: Store files directly on the Flask server's filesystem.

**Pros**:
- Simplest implementation
- No external dependencies or costs
- Faster access (no network latency)
- Easier local development

**Cons**:
- Does not scale horizontally (multiple server instances need shared filesystem)
- Manual backup and disaster recovery required
- Limited by server disk capacity
- File loss risk if server fails
- Difficult to manage as data grows

**Rejection Reason**: Does not meet scalability requirements for a production application.

### 2. PostgreSQL Binary Storage (BYTEA)
**Description**: Store file content as binary data in PostgreSQL database.

**Pros**:
- Single storage system (no external service needed)
- ACID transactions for file operations
- Backup/restore handled with database backups

**Cons**:
- Poor database performance with large files
- Increases database size significantly
- Expensive backup costs
- Not designed for blob storage (inefficient)
- Difficult to serve files efficiently

**Rejection Reason**: PostgreSQL is optimized for structured data, not file storage. This would degrade database performance.

### 3. Alternative Cloud Storage (Google Cloud Storage, Azure Blob Storage)
**Description**: Use competing cloud storage services.

**Pros**:
- Similar features and benefits to S3
- May have better pricing in some regions
- Comparable durability and availability

**Cons**:
- Team has more experience with AWS
- boto3 has excellent Python support
- S3 is the most mature object storage solution
- Existing infrastructure may already use AWS

**Rejection Reason**: S3 is the industry standard with the best Python ecosystem support. No compelling reason to choose alternatives.

### 4. Self-Hosted Object Storage (MinIO)
**Description**: Deploy self-hosted S3-compatible object storage.

**Pros**:
- S3-compatible API (works with boto3)
- No vendor lock-in
- Potentially lower costs at scale
- Full control over infrastructure

**Cons**:
- Requires infrastructure management and maintenance
- Need to handle backups, monitoring, and disaster recovery
- No built-in global distribution
- Operational complexity for a small team
- Upfront infrastructure costs

**Rejection Reason**: Operational overhead outweighs benefits for this stage of the project. Can reconsider if cost becomes prohibitive.

---

## References

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [boto3 S3 Client Documentation](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html)
- File implementation: `backend/routes/projects.py:164-253`
- Database model: `backend/models.py:51-69`
