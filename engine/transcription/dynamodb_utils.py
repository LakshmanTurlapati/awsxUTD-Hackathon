import uuid
import json
import os
from datetime import datetime
import logging
from botocore.exceptions import ClientError  # Added import for proper exception handling

# Configure logging
logger = logging.getLogger(__name__)

# Try importing boto3, but don't fail if it's not available
try:
    import boto3
    DYNAMODB_AVAILABLE = True
except ImportError:
    logger.warning("boto3 package not found. DynamoDB features will be disabled.")
    DYNAMODB_AVAILABLE = False

# Mock data storage for use when DynamoDB is not available
MOCK_CANDIDATES = []
MOCK_REFERERS = []

# For local development, connect to DynamoDB local
def get_dynamodb_client():
    if not DYNAMODB_AVAILABLE:
        return None
        
    try:
        # Check if running locally with Docker or in production
        if os.environ.get('AWS_EXECUTION_ENV') is None:
            # For local environment, just use in-memory storage
            logger.warning("Running in local environment, using in-memory storage instead of DynamoDB")
            return None
        else:
            # Production environment
            return boto3.client('dynamodb')
    except Exception as e:
        logger.error(f"Error connecting to DynamoDB: {str(e)}")
        return None

def create_candidates_table_if_not_exists():
    """Create the Candidates table if it doesn't exist"""
    client = get_dynamodb_client()
    if not client:
        logger.warning("DynamoDB client not available. Skipping table creation.")
        return
    
    # Check if table exists
    try:
        client.describe_table(TableName='Candidates')
        logger.info("Candidates table already exists")
        return
    except Exception as e:
        # Table doesn't exist or other error, create it
        logger.info("Creating Candidates table")
        
        try:
            response = client.create_table(
                TableName='Candidates',
                KeySchema=[
                    {
                        'AttributeName': 'id',
                        'KeyType': 'HASH'  # Partition key
                    }
                ],
                AttributeDefinitions=[
                    {
                        'AttributeName': 'id',
                        'AttributeType': 'S'
                    }
                ],
                ProvisionedThroughput={
                    'ReadCapacityUnits': 5,
                    'WriteCapacityUnits': 5
                }
            )
            
            # Wait for table creation
            client.get_waiter('table_exists').wait(TableName='Candidates')
            logger.info("Candidates table created successfully")
        except Exception as create_err:
            logger.error(f"Error creating DynamoDB table: {str(create_err)}")

def save_candidate(candidate_data):
    """Save candidate data to DynamoDB"""
    # Generate a unique ID if not provided
    if 'id' not in candidate_data:
        candidate_data['id'] = str(uuid.uuid4())
    
    if not candidate_data.get('timestamp'):
        candidate_data['timestamp'] = int(datetime.now().timestamp() * 1000)
    
    client = get_dynamodb_client()
    if not client:
        # Use in-memory storage as fallback
        logger.warning("Using in-memory storage for candidate data")
        MOCK_CANDIDATES.append(candidate_data.copy())
        return candidate_data['id']
    
    # Ensure table exists
    create_candidates_table_if_not_exists()
    
    try:
        # Convert to DynamoDB format
        item = {
            'id': {'S': candidate_data['id']},
            'name': {'S': candidate_data.get('name', '')},
            'email': {'S': candidate_data.get('email', '')},
            'education': {'S': candidate_data.get('education', '')},
            'experience': {'N': str(candidate_data.get('experience', 0))},
            'timestamp': {'N': str(candidate_data.get('timestamp', int(datetime.now().timestamp() * 1000)))}
        }
        
        # Add optional fields if they exist
        if 'fluencyScore' in candidate_data:
            item['fluencyScore'] = {'N': str(candidate_data['fluencyScore'])}
        
        if 'interpersonalScore' in candidate_data:
            item['interpersonalScore'] = {'N': str(candidate_data['interpersonalScore'])}
        
        if 'interestsScore' in candidate_data:
            item['interestsScore'] = {'N': str(candidate_data['interestsScore'])}
        
        if 'careerGoalsScore' in candidate_data:
            item['careerGoalsScore'] = {'N': str(candidate_data['careerGoalsScore'])}
        
        if 'pythonScore' in candidate_data:
            item['pythonScore'] = {'N': str(candidate_data['pythonScore'])}
        
        if 'javaScore' in candidate_data:
            item['javaScore'] = {'N': str(candidate_data['javaScore'])}
        
        if 'awsScore' in candidate_data:
            item['awsScore'] = {'N': str(candidate_data['awsScore'])}
        
        if 'cppScore' in candidate_data:
            item['cppScore'] = {'N': str(candidate_data['cppScore'])}
        
        # Add responses as a map if they exist
        if 'responses' in candidate_data and candidate_data['responses']:
            item['responses'] = {'M': {}}
            responses = candidate_data['responses']
            
            if 'interests' in responses:
                item['responses']['M']['interests'] = {'S': responses['interests']}
            
            if 'careerGoals' in responses:
                item['responses']['M']['careerGoals'] = {'S': responses['careerGoals']}
            
            if 'transcription' in responses:
                item['responses']['M']['transcription'] = {'S': responses['transcription']}
        
        # Save to DynamoDB
        client.put_item(
            TableName='Candidates',
            Item=item
        )
        
        return candidate_data['id']
    except Exception as e:
        logger.error(f"Error saving to DynamoDB: {str(e)}")
        # Fallback to in-memory storage
        MOCK_CANDIDATES.append(candidate_data.copy())
        return candidate_data['id']

def get_all_candidates():
    """Get all candidates from DynamoDB"""
    client = get_dynamodb_client()
    if not client:
        # Return in-memory data if DynamoDB is not available
        logger.warning("Using in-memory storage to retrieve candidate data")
        return MOCK_CANDIDATES
    
    # Ensure table exists
    create_candidates_table_if_not_exists()
    
    try:
        # Scan the table to get all items
        response = client.scan(TableName='Candidates')
        
        # Convert from DynamoDB format to regular JSON
        candidates = []
        for item in response.get('Items', []):
            candidate = {
                'id': item.get('id', {}).get('S', ''),
                'name': item.get('name', {}).get('S', ''),
                'email': item.get('email', {}).get('S', ''),
                'education': item.get('education', {}).get('S', ''),
                'experience': int(item.get('experience', {}).get('N', '0')),
                'timestamp': int(item.get('timestamp', {}).get('N', '0'))
            }
            
            # Add optional fields if they exist
            if 'fluencyScore' in item:
                candidate['fluencyScore'] = int(item['fluencyScore']['N'])
            
            if 'interpersonalScore' in item:
                candidate['interpersonalScore'] = int(item['interpersonalScore']['N'])
            
            if 'interestsScore' in item:
                candidate['interestsScore'] = int(item['interestsScore']['N'])
            
            if 'careerGoalsScore' in item:
                candidate['careerGoalsScore'] = int(item['careerGoalsScore']['N'])
            
            if 'pythonScore' in item:
                candidate['pythonScore'] = int(item['pythonScore']['N'])
            
            if 'javaScore' in item:
                candidate['javaScore'] = int(item['javaScore']['N'])
            
            if 'awsScore' in item:
                candidate['awsScore'] = int(item['awsScore']['N'])
            
            if 'cppScore' in item:
                candidate['cppScore'] = int(item['cppScore']['N'])
            
            # Add responses if they exist
            if 'responses' in item:
                candidate['responses'] = {}
                responses = item['responses']['M']
                
                if 'interests' in responses:
                    candidate['responses']['interests'] = responses['interests']['S']
                
                if 'careerGoals' in responses:
                    candidate['responses']['careerGoals'] = responses['careerGoals']['S']
                
                if 'transcription' in responses:
                    candidate['responses']['transcription'] = responses['transcription']['S']
            
            candidates.append(candidate)
        
        return candidates
    except Exception as e:
        logger.error(f"Error retrieving from DynamoDB: {str(e)}")
        # Return in-memory data as fallback
        return MOCK_CANDIDATES

def delete_candidate(candidate_id):
    """Delete a candidate from DynamoDB by ID"""
    client = get_dynamodb_client()
    if not client:
        # Use in-memory storage as fallback
        logger.warning("Using in-memory storage to delete candidate data")
        global MOCK_CANDIDATES
        MOCK_CANDIDATES = [c for c in MOCK_CANDIDATES if c.get('id') != candidate_id]
        return True
    
    # Ensure table exists
    create_candidates_table_if_not_exists()
    
    try:
        response = client.delete_item(
            TableName='Candidates',
            Key={
                'id': {'S': candidate_id}
            }
        )
        logger.info(f"Delete response: {response}")
        # If no exception is raised, assume deletion is successful
        return True
    except ClientError as e:
         error_code = e.response['Error'].get('Code')
         if error_code == "ResourceNotFoundException":
             logger.warning(f"Resource not found during deletion for candidate {candidate_id}: {str(e)}. Returning success for idempotency.")
             return True
         else:
             logger.error(f"Error deleting from DynamoDB: {str(e)}")
             return False
    except Exception as e:
        logger.error(f"Error deleting from DynamoDB: {str(e)}")
        return False

def create_referers_table_if_not_exists():
    """Create the Referers table if it doesn't exist"""
    client = get_dynamodb_client()
    if not client:
        logger.warning("DynamoDB client not available. Skipping table creation.")
        return
    
    # Check if table exists
    try:
        client.describe_table(TableName='Referers')
        logger.info("Referers table already exists")
        return
    except Exception as e:
        # Table doesn't exist or other error, create it
        logger.info("Creating Referers table")
        
        try:
            response = client.create_table(
                TableName='Referers',
                KeySchema=[
                    {
                        'AttributeName': 'id',
                        'KeyType': 'HASH'  # Partition key
                    }
                ],
                AttributeDefinitions=[
                    {
                        'AttributeName': 'id',
                        'AttributeType': 'S'
                    }
                ],
                ProvisionedThroughput={
                    'ReadCapacityUnits': 5,
                    'WriteCapacityUnits': 5
                }
            )
            
            # Wait for table creation
            client.get_waiter('table_exists').wait(TableName='Referers')
            logger.info("Referers table created successfully")
        except Exception as create_err:
            logger.error(f"Error creating DynamoDB table: {str(create_err)}")

def save_referer(referer_data):
    """Save referer data to DynamoDB"""
    # Generate a unique ID if not provided
    if 'id' not in referer_data:
        referer_data['id'] = str(uuid.uuid4())
    
    client = get_dynamodb_client()
    if not client:
        # Use in-memory storage as fallback
        logger.warning("Using in-memory storage for referer data")
        MOCK_REFERERS.append(referer_data.copy())
        return referer_data['id']
    
    # Ensure table exists
    create_referers_table_if_not_exists()
    
    try:
        # Convert to DynamoDB format
        item = {
            'id': {'S': referer_data['id']},
            'name': {'S': referer_data.get('name', '')},
            'role': {'S': referer_data.get('role', '')},
            'image': {'S': referer_data.get('image', '')},
            'about': {'S': referer_data.get('about', '')},
            'requirement': {'S': referer_data.get('requirement', '')}
        }
        
        # Save to DynamoDB
        client.put_item(
            TableName='Referers',
            Item=item
        )
        
        return referer_data['id']
    except Exception as e:
        logger.error(f"Error saving to DynamoDB: {str(e)}")
        # Fallback to in-memory storage
        MOCK_REFERERS.append(referer_data.copy())
        return referer_data['id']

def get_all_referers():
    """Get all referers from DynamoDB"""
    client = get_dynamodb_client()
    if not client:
        # Return in-memory data if DynamoDB is not available
        logger.warning("Using in-memory storage to retrieve referer data")
        return MOCK_REFERERS
    
    # Ensure table exists
    create_referers_table_if_not_exists()
    
    try:
        # Scan the table to get all items
        response = client.scan(TableName='Referers')
        
        # Convert from DynamoDB format to regular JSON
        referers = []
        for item in response.get('Items', []):
            referer = {
                'id': item.get('id', {}).get('S', ''),
                'name': item.get('name', {}).get('S', ''),
                'role': item.get('role', {}).get('S', ''),
                'image': item.get('image', {}).get('S', ''),
                'about': item.get('about', {}).get('S', ''),
                'requirement': item.get('requirement', {}).get('S', '')
            }
            
            referers.append(referer)
        
        return referers
    except Exception as e:
        logger.error(f"Error retrieving from DynamoDB: {str(e)}")
        # Return in-memory data as fallback
        return MOCK_REFERERS

def get_referer_by_id(referer_id):
    """Get a referer from DynamoDB by ID"""
    client = get_dynamodb_client()
    if not client:
        # Use in-memory storage as fallback
        logger.warning("Using in-memory storage to retrieve referer data")
        for referer in MOCK_REFERERS:
            if referer['id'] == referer_id:
                return referer
        return None
    
    # Ensure table exists
    create_referers_table_if_not_exists()
    
    try:
        # Get the item by ID
        response = client.get_item(
            TableName='Referers',
            Key={
                'id': {'S': referer_id}
            }
        )
        
        # Check if item was found
        if 'Item' not in response:
            return None
        
        # Convert from DynamoDB format to regular JSON
        item = response['Item']
        referer = {
            'id': item.get('id', {}).get('S', ''),
            'name': item.get('name', {}).get('S', ''),
            'role': item.get('role', {}).get('S', ''),
            'image': item.get('image', {}).get('S', ''),
            'about': item.get('about', {}).get('S', ''),
            'requirement': item.get('requirement', {}).get('S', '')
        }
        
        return referer
    except Exception as e:
        logger.error(f"Error retrieving from DynamoDB: {str(e)}")
        # Try in-memory data as fallback
        for referer in MOCK_REFERERS:
            if referer['id'] == referer_id:
                return referer
        return None

def delete_referer(referer_id):
    """Delete a referer from DynamoDB by ID"""
    client = get_dynamodb_client()
    if not client:
        # Use in-memory storage as fallback
        logger.warning("Using in-memory storage to delete referer data")
        global MOCK_REFERERS
        MOCK_REFERERS = [r for r in MOCK_REFERERS if r['id'] != referer_id]
        return True
    
    # Ensure table exists
    create_referers_table_if_not_exists()
    
    try:
        # Delete the item
        client.delete_item(
            TableName='Referers',
            Key={
                'id': {'S': referer_id}
            }
        )
        
        return True
    except Exception as e:
        logger.error(f"Error deleting from DynamoDB: {str(e)}")
        return False 