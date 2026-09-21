FROM python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY public ./public
ENV PORT=8080 DATA_DIR=/data PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8080
CMD ["python", "server.py"]
