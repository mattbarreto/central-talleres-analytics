import urllib.request
import json

BASE = "http://127.0.0.1:8000"

# Test health
resp = urllib.request.urlopen(f"{BASE}/health")
print("Health:", json.loads(resp.read()))

# Test login
data = json.dumps({"email": "admin@example.com", "password": "admin123"}).encode()
req = urllib.request.Request(f"{BASE}/api/v1/auth/login", data=data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req)
token_data = json.loads(resp.read())
token = token_data["access_token"]
print("Login OK! Token:", token[:30] + "...")

# Test list workshops (empty)
req = urllib.request.Request(f"{BASE}/api/v1/workshops/", headers={"Authorization": f"Bearer {token}"})
resp = urllib.request.urlopen(req)
print("Workshops:", json.loads(resp.read()))

# Test create a workshop
data = json.dumps({"name": "Python Basics", "cohort_year": 2026, "status": "planned"}).encode()
req = urllib.request.Request(f"{BASE}/api/v1/workshops/", data=data, headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
resp = urllib.request.urlopen(req)
workshop = json.loads(resp.read())
print("Workshop creado:", workshop["name"], workshop["id"])

# Test list participants (empty)
req = urllib.request.Request(f"{BASE}/api/v1/participants/", headers={"Authorization": f"Bearer {token}"})
resp = urllib.request.urlopen(req)
print("Participants:", json.loads(resp.read()))

print("\nTodos los endpoints funcionan correctamente!")
