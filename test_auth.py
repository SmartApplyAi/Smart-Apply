from utils import hash_password, verify_password, needs_rehash
import pytest

def test_argon2_hashing():
    pwd = "my_secure_password"
    hashed = hash_password(pwd)

    assert "$argon2" in hashed
    assert verify_password(pwd, hashed)

def test_bcrypt_migration():
    from passlib.context import CryptContext
    # Manually create a bcrypt hash
    old_ctx = CryptContext(schemes=["bcrypt"])
    pwd = "old_password_123"
    old_hash = old_ctx.hash(pwd)

    # Verify our new context accepts it
    assert verify_password(pwd, old_hash)

    # Verify it needs a rehash
    assert needs_rehash(old_hash)

    # Verify new argon hash does not need rehash
    new_hash = hash_password(pwd)
    assert not needs_rehash(new_hash)
