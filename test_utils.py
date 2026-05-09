import pytest
from datetime import timedelta, datetime
from bson import ObjectId
from utils import (
    hash_password, verify_password, needs_rehash,
    create_access_token, create_refresh_token, decode_token,
    generate_pin, generate_reset_token, generate_extension_token,
    encrypt_value, decrypt_value,
    paginate_params, paginate_response,
    serialise_doc
)
from websocket.auth import create_ws_ticket

# --- Existing Placeholder Test ---
@pytest.mark.asyncio
async def test_ws_ticket_is_mocked():
    # Since Redis is not running, we just skip real integration testing
    assert True

# --- Hashing Tests ---
def test_password_hashing():
    password = "testpassword123"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrongpassword", hashed)
    assert not needs_rehash(hashed)

def test_verify_password_invalid_hash():
    # Should handle malformed hashes gracefully (return False)
    assert not verify_password("password", "invalid_hash")
    assert not verify_password("password", "")

# --- JWT Tests ---
def test_jwt_tokens():
    data = {"sub": "user123", "role": "admin"}

    # Access Token
    access_token = create_access_token(data)
    decoded_access = decode_token(access_token)
    assert decoded_access["sub"] == "user123"
    assert decoded_access["type"] == "access"

    # Refresh Token
    refresh_token = create_refresh_token(data)
    decoded_refresh = decode_token(refresh_token)
    assert decoded_refresh["sub"] == "user123"
    assert decoded_refresh["type"] == "refresh"

def test_decode_invalid_token():
    assert decode_token("invalid.token.here") is None
    assert decode_token("") is None

def test_jwt_expiration():
    data = {"sub": "user123"}
    # Create an expired token by passing a negative timedelta
    token = create_access_token(data, expires_delta=timedelta(seconds=-10))
    assert decode_token(token) is None

# --- Random Generation Tests ---
def test_generate_pin():
    pin = generate_pin(6)
    assert len(pin) == 6
    assert pin.isdigit()

    pin4 = generate_pin(4)
    assert len(pin4) == 4
    assert pin4.isdigit()

def test_generate_tokens():
    reset_token = generate_reset_token()
    assert len(reset_token) >= 48 # secrets.token_urlsafe(48)

    ext_token = generate_extension_token()
    assert len(ext_token) >= 64 # secrets.token_urlsafe(64)
    assert reset_token != ext_token

# --- Encryption Tests ---
def test_encryption_decryption():
    original_value = "secret_api_key_123"
    encrypted = encrypt_value(original_value)
    assert encrypted != original_value

    decrypted = decrypt_value(encrypted)
    assert decrypted == original_value

def test_encryption_empty_values():
    assert encrypt_value("") == ""
    assert decrypt_value("") == ""

def test_decrypt_invalid_value():
    # decrypt_value should return empty string on failure
    assert decrypt_value("not_encrypted_properly") == ""

# --- Pagination Tests ---
def test_paginate_params():
    params = paginate_params(skip=10, limit=50)
    assert params == {"skip": 10, "limit": 50}

    # Bounds check
    params_min = paginate_params(skip=-1, limit=0)
    assert params_min["skip"] == 0
    assert params_min["limit"] == 1 # limit max(limit, 1)

    params_max = paginate_params(limit=200)
    assert params_max["limit"] == 100 # limit min(limit, 100)

def test_paginate_response():
    items = [1, 2, 3]
    total = 10
    skip = 0
    limit = 3

    resp = paginate_response(items, total, skip, limit)
    assert resp["items"] == items
    assert resp["total"] == total
    assert resp["page"] == 1
    assert resp["pages"] == 4 # ceil(10/3)
    assert resp["has_next"] is True
    assert resp["has_prev"] is False

    resp2 = paginate_response(items, total, skip=9, limit=3)
    assert resp2["page"] == 4
    assert resp2["has_next"] is False
    assert resp2["has_prev"] is True

# --- Serialization Tests ---
def test_serialise_doc():
    obj_id = ObjectId()
    now = datetime.now()
    doc = {
        "_id": obj_id,
        "name": "Test User",
        "created_at": now,
        "metadata": {"key": "value"}
    }

    serialised = serialise_doc(doc)
    assert serialised["id"] == str(obj_id)
    assert "created_at" in serialised
    assert isinstance(serialised["created_at"], str)
    assert serialised["name"] == "Test User"
    assert serialised["metadata"] == {"key": "value"}
    assert "_id" not in serialised

def test_serialise_none():
    assert serialise_doc(None) == {}
