import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# 환경 변수를 테스트용 DB로 임시 오버라이드
os.environ["DATABASE_URL"] = "sqlite:///./test_accounting.db"

# config get_settings lru_cache 클리어
from app.config import get_settings
get_settings.cache_clear()

from app.database import Base, get_db
from app.main import app

# 테스트 실행 시 lifespan(실제 DB 시딩 로직) 무력화하여 격리성 및 속도 확보
from contextlib import asynccontextmanager
@asynccontextmanager
async def mock_lifespan(app):
    yield

app.router.lifespan_context = mock_lifespan

TEST_DATABASE_URL = "sqlite:///./test_accounting.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

@pytest.fixture(scope="function", autouse=True)
def setup_database():
    # 매 테스트마다 데이터베이스 테이블 깨끗하게 새로 생성
    Base.metadata.create_all(bind=test_engine)
    
    yield
    
    # 테스트 종료 후 데이터베이스 테이블 드롭
    Base.metadata.drop_all(bind=test_engine)

@pytest.fixture(scope="function")
def db_session(setup_database):
    session = TestingSessionLocal()
    
    # app의 get_db 의존성을 테스트용 세션으로 오버라이드
    def override_get_db():
        try:
            yield session
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    
    yield session
    session.close()

@pytest.fixture(scope="function")
def client(db_session):
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="session", autouse=True)
def cleanup_file():
    yield
    # SQLite 파일 정리
    if os.path.exists("./test_accounting.db"):
        try:
            os.remove("./test_accounting.db")
        except PermissionError:
            pass
