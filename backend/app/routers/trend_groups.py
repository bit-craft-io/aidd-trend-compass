from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import trend_group_service
from ..db import get_db
from ..schemas import DeleteResponse, TrendGroupCreateRequest, TrendGroupOut

router = APIRouter(prefix="/trend-groups", tags=["trend-groups"])


@router.get("", response_model=list[TrendGroupOut])
def list_trend_groups(db: Session = Depends(get_db)):
    return trend_group_service.list_active_groups(db)


@router.post("", response_model=TrendGroupOut, status_code=201)
def add_trend_group(body: TrendGroupCreateRequest, db: Session = Depends(get_db)):
    return trend_group_service.create_group(db, body.name)


@router.delete("/{group_id}", response_model=DeleteResponse)
def delete_trend_group(group_id: int, db: Session = Depends(get_db)):
    deleted = trend_group_service.soft_delete_group(db, group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"グループID {group_id} は見つかりません")
    return DeleteResponse(deleted=True)
