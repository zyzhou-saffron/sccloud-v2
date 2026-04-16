#!/usr/bin/env bash
# scCloud v2 — 端到端 API 测试脚本
# 用法: bash tests/test_api.sh [BASE_URL]
# 默认: http://localhost:8000

set -e

BASE="${1:-http://localhost:8000}"
PASS=0
FAIL=0
TOKEN=""

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }

check() {
    local desc="$1" code="$2" expected="$3"
    if [ "$code" -eq "$expected" ]; then
        green "$desc (HTTP $code)"
        PASS=$((PASS + 1))
    else
        red "$desc (期望 $expected, 实际 $code)"
        FAIL=$((FAIL + 1))
    fi
}

echo "===== scCloud v2 E2E API 测试 ====="
echo "目标: $BASE"
echo ""

# ---- 1. 健康检查 ----
echo "--- 健康检查 ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
check "GET /api/health" "$CODE" 200

# ---- 2. 注册 ----
echo ""
echo "--- 认证 ---"
USER="e2e_$(date +%s)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USER\",\"password\":\"test123\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /api/auth/register" "$CODE" 201

TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

# ---- 3. 登录 ----
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
    -d "username=$USER&password=test123")
check "POST /api/auth/login" "$CODE" 200

# ---- 4. 获取当前用户 ----
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/me" \
    -H "Authorization: Bearer $TOKEN")
check "GET /api/auth/me" "$CODE" 200

# ---- 5. 修改密码 ----
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/change-password" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"old_password\":\"test123\",\"new_password\":\"newpass123\"}")
check "POST /api/auth/change-password" "$CODE" 200

# ---- 6. 项目管理 ----
echo ""
echo "--- 项目管理 ---"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"e2e_project\",\"species\":\"human\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /api/projects (创建)" "$CODE" 201

PROJECT_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/projects" \
    -H "Authorization: Bearer $TOKEN")
check "GET /api/projects (列表)" "$CODE" 200

# ---- 7. 任务提交 ----
echo ""
echo "--- 任务管理 ---"
if [ -n "$PROJECT_ID" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/tasks" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"project_id\":$PROJECT_ID,\"step\":\"qc\",\"params\":{\"mito_pct\":20}}")
    CODE=$(echo "$RESP" | tail -1)
    BODY=$(echo "$RESP" | head -1)
    check "POST /api/tasks (提交 QC)" "$CODE" 201

    TASK_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

    if [ -n "$TASK_ID" ]; then
        CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/tasks/$TASK_ID" \
            -H "Authorization: Bearer $TOKEN")
        check "GET /api/tasks/{id} (详情)" "$CODE" 200
    fi

    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/tasks?project_id=$PROJECT_ID" \
        -H "Authorization: Bearer $TOKEN")
    check "GET /api/tasks?project_id (筛选)" "$CODE" 200
fi

# ---- 8. 分片上传 ----
echo ""
echo "--- 分片上传 ---"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/upload/init" \
    -H "Authorization: Bearer $TOKEN" \
    -F "filename=test.rds" \
    -F "file_size=1024")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
check "POST /api/upload/init" "$CODE" 200

UPLOAD_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_id',''))" 2>/dev/null || echo "")

if [ -n "$UPLOAD_ID" ]; then
    # 创建临时测试数据
    dd if=/dev/urandom of=/tmp/test_chunk.bin bs=1024 count=1 2>/dev/null
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload/chunk" \
        -H "Authorization: Bearer $TOKEN" \
        -F "upload_id=$UPLOAD_ID" \
        -F "chunk_index=0" \
        -F "chunk=@/tmp/test_chunk.bin")
    check "POST /api/upload/chunk" "$CODE" 200

    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/upload/complete" \
        -H "Authorization: Bearer $TOKEN" \
        -F "upload_id=$UPLOAD_ID")
    check "POST /api/upload/complete" "$CODE" 200
    rm -f /tmp/test_chunk.bin
fi

# ---- 9. OpenAPI 文档 ----
echo ""
echo "--- 文档 ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/docs")
check "GET /docs (Swagger)" "$CODE" 200

CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/openapi.json")
check "GET /openapi.json" "$CODE" 200

# ---- 10. 清理 ----
echo ""
echo "--- 清理 ---"
if [ -n "$PROJECT_ID" ]; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/projects/$PROJECT_ID" \
        -H "Authorization: Bearer $TOKEN")
    check "DELETE /api/projects/{id}" "$CODE" 204
fi

# ---- 结果 ----
echo ""
echo "============================="
echo "通过: $PASS  失败: $FAIL"
if [ "$FAIL" -eq 0 ]; then
    green "所有测试通过 🎉"
else
    red "$FAIL 个测试失败"
    exit 1
fi
