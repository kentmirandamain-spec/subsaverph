FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure store directory exists
RUN mkdir -p data/store

ENV PORT=8790
EXPOSE 8790

CMD ["python", "server.py"]
