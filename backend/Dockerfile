FROM python:3.11-slim
WORKDIR /app

# 한국 시간대 설정 (회계 전표 날짜 기준 중요)
ENV TZ=Asia/Seoul
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 인계 메모의 백엔드 포트 8500 지정
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8500"]