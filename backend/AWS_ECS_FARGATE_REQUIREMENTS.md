# AWS ECS Fargate Server Requirements

**Application:** DocFlow Backend (FastAPI + YOLO + PyTorch)  
**Last Updated:** December 23, 2025

---

## 🖥️ Recommended Configurations

| Use Case | vCPU | Memory | Storage | Workers | Cost/Month* |
|----------|------|--------|---------|---------|-------------|
| **Development** | 1 | 4 GB | 30 GB | 5-10 | ~$35 |
| **Production** ⭐ | **2** | **16 GB** | **50 GB** | **20** | **~$100** |
| **High Traffic** | 4 | 16 GB | 100 GB | 30 | ~$140 |

*Single task, us-east-1 region, 24/7

---

## 📊 Resource Requirements

### Memory Breakdown (16 GB)
- **Python + FastAPI:** 300 MB
- **PyTorch CPU:** 2 GB
- **YOLO Models:** 500 MB
- **20 PDF Workers:** 5 GB
- **Thread Pools:** 3 GB (100 LLM + 50 encoding + 50 conversion)
- **OpenCV + PyMuPDF:** 500 MB
- **Buffer:** 2-3 GB
- **Total Peak:** ~12-14 GB

### CPU Requirements (2 vCPU)
- YOLO inference (signature + face detection)
- Parallel PDF processing (1-30 workers)
- Image encoding/conversion
- PyMuPDF rendering

### Storage (50 GB)
- Container image: 4 GB
- YOLO models: 90 MB
- Temp files: 10-30 GB peak
- Logs: 250 MB

---

## ⚙️ Environment Configuration

```env
# PDF Processing
PDF_PROCESSING_MAX_WORKERS=20

# YOLO Detection
YOLO_SIGNATURE_ENABLED=true
YOLO_FACE_ENABLED=true
YOLO_USE_GPU=false

# Logging
LOG_LEVEL=WARNING
LOG_RETENTION_DAYS=7
```

---

## 💰 Production Costs (us-east-1)

| Configuration | Single Task | 2 Tasks (HA) |
|---------------|-------------|--------------|
| 2 vCPU / 16 GB | $100/month | $200/month |
| 4 vCPU / 16 GB | $130/month | $260/month |

**Auto-scaling:** 2-10 tasks = ~$300-1000/month

---

## 📈 Performance Benchmarks

**With 2 vCPU / 16 GB / 20 Workers:**

| Document Type | Pages | Time | Throughput/Hour |
|---------------|-------|------|-----------------|
| Simple Text | 1-5 | 3-8s | ~450 |
| Forms | 5-10 | 10-20s | ~180 |
| Complex | 10-50 | 30-90s | ~60 |
| Large Scan | 50-100 | 90-180s | ~30 |

---

## ✅ Production Recommendation

```
vCPU: 2
Memory: 16 GB
Ephemeral Storage: 50 GB
Workers: 20
Min Tasks: 2
Max Tasks: 10
```
