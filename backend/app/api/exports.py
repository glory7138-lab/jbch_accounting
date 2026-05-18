from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.export_service import export_vouchers_to_excel, export_vouchers_to_markdown

router = APIRouter(prefix="/exports", tags=["exports"])


@router.get("/vouchers.xlsx")
def export_vouchers_excel(db: Session = Depends(get_db)):
    content = export_vouchers_to_excel(db)
    return StreamingResponse(iter([content]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="vouchers.xlsx"'})


@router.get("/vouchers.md", response_class=PlainTextResponse)
def export_vouchers_markdown(db: Session = Depends(get_db)):
    return export_vouchers_to_markdown(db)
