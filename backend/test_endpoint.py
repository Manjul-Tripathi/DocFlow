import requests
import json

folder_id = 'c115a06f-aa2d-4e3a-81ab-582e754acb49'
url = f'http://localhost:8000/api/v1/folders/{folder_id}/documents'

try:
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
