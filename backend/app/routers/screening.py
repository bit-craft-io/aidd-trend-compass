import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import (
    jquants_client,
    models,
    indicator_service,
    screening_signals,
    trend_candidate_condition_service,
    trend_candidate_result_service,
    trend_candidate_service,
    trend_code_name_service,
    trend_service,
)
from ..db import SessionLocal, get_db
from ..schemas import (
    DeleteResponse,
    ScreeningCandlesOut,
    ScreeningConditionOut,
    ScreeningConditionRenameRequest,
    ScreeningRegisterRequest,
    ScreeningRegisterResponse,
    ScreeningResultsOut,
    ScreeningScanResponse,
    ScreeningSearchRequest,
    ScreeningSearchResponse,
    ScreeningStatusOut,
)
from ..yfinance_client import InvalidCodeError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/screening", tags=["screening"])


def _run_scan_with_own_session() -> None:
    # リクエストスコープのセッションはレスポンス後に閉じられるため、
    # 長時間のスキャンは自前のセッションで実行する。
    db = SessionLocal()
    try:
        trend_candidate_service.run_scan(db)
    except Exception:
        logger.exception("screening scan failed")
    finally:
        db.close()


@router.post("/scan", response_model=ScreeningScanResponse)
def start_scan(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not jquants_client.JQUANTS_API_KEY:
        raise HTTPException(status_code=400, detail="J-Quants APIキーが未設定です")
    if trend_candidate_service.is_cooldown_active(db):
        raise HTTPException(status_code=423, detail="クールダウン中のため取得できません")

    # 二重実行防止のため、バックグラウンド起動の前(リクエスト内)で開始日時を書き込む。
    trend_candidate_service.mark_scan_started(db)
    background_tasks.add_task(_run_scan_with_own_session)
    return ScreeningScanResponse(started=True)


@router.get("/status", response_model=ScreeningStatusOut)
def get_status(db: Session = Depends(get_db)):
    return ScreeningStatusOut(
        api_key_configured=bool(jquants_client.JQUANTS_API_KEY),
        cooldown_active=trend_candidate_service.is_cooldown_active(db),
        remaining_cooldown_seconds=trend_candidate_service.remaining_cooldown_seconds(db),
        rate_limit_per_64s=jquants_client.JQUANTS_RATE_LIMIT_PER_64S,
        max_stocks=jquants_client.JQUANTS_MAX_STOCKS,
        is_free_mode=jquants_client.JQUANTS_RATE_LIMIT_PER_64S <= 5,
        last_run_at=trend_candidate_service.last_run_at_iso(db),
    )


@router.post("/search", response_model=ScreeningSearchResponse)
def search(body: ScreeningSearchRequest, db: Session = Depends(get_db)):
    unknown = set(body.enabled_signals) - set(screening_signals.SIGNAL_FUNCTIONS)
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"未知のシグナルです: {', '.join(sorted(unknown))}"
        )
    condition = trend_candidate_condition_service.get_or_create_condition(
        db, body.enabled_signals
    )
    matched = trend_candidate_result_service.run_search(db, condition)
    return ScreeningSearchResponse(
        condition_id=condition.id, condition_name=condition.name, matched_count=len(matched)
    )


def _to_condition_out(condition: models.TrendCandidateCondition) -> ScreeningConditionOut:
    enabled_signals = [key for key, params in condition.condition.items() if params.get("enabled")]
    return ScreeningConditionOut(id=condition.id, name=condition.name, enabled_signals=enabled_signals)


@router.get("/conditions", response_model=list[ScreeningConditionOut])
def list_conditions(db: Session = Depends(get_db)):
    return [_to_condition_out(c) for c in trend_candidate_condition_service.list_conditions(db)]


@router.patch("/conditions/{condition_id}", response_model=ScreeningConditionOut)
def rename_condition(
    condition_id: int, body: ScreeningConditionRenameRequest, db: Session = Depends(get_db)
):
    condition = trend_candidate_condition_service.rename_condition(db, condition_id, body.name)
    if condition is None:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    return _to_condition_out(condition)


@router.delete("/conditions/{condition_id}", response_model=DeleteResponse)
def delete_condition(condition_id: int, db: Session = Depends(get_db)):
    deleted = trend_candidate_condition_service.soft_delete_condition(db, condition_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    return DeleteResponse(deleted=True)


@router.get("/results/{condition_id}", response_model=ScreeningResultsOut)
def get_results(condition_id: int, db: Session = Depends(get_db)):
    if trend_candidate_condition_service.get_active_condition(db, condition_id) is None:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    items = trend_candidate_result_service.get_cached_results(db, condition_id)
    return ScreeningResultsOut(condition_id=condition_id, total=len(items), items=items)


@router.get("/candidates/{code}/candles", response_model=ScreeningCandlesOut)
def get_candidate_candles(code: str, db: Session = Depends(get_db)):
    candidate = (
        db.query(models.TrendCandidate)
        .filter(models.TrendCandidate.code == code, models.TrendCandidate.deleted_at.is_(None))
        .first()
    )
    if candidate is None:
        raise HTTPException(status_code=404, detail="candidate not found")
    candles = [
        {
            "time": bar["date"],
            "open": bar["o"],
            "high": bar["h"],
            "low": bar["l"],
            "close": bar["c"],
            "volume": bar["v"],
        }
        for bar in (candidate.detail or {}).get("history", [])
    ]
    # 5本未満の期間は移動平均を出さない(compute_sma5は先頭を拡大窓平均で返すため切り落とす)
    sma5 = indicator_service.compute_sma5(candles)[4:]
    name = trend_code_name_service.get_names(db, [candidate.code]).get(candidate.code, "")
    return {"code": candidate.code, "name": name, "candles": candles, "sma5": sma5}


@router.post("/register", response_model=ScreeningRegisterResponse)
def register(body: ScreeningRegisterRequest, db: Session = Depends(get_db)):
    registered: list[str] = []
    failed: list[str] = []
    skipped_count = 0
    for code in dict.fromkeys(body.codes):
        if trend_service.get_active_trend(db, code) is not None:
            skipped_count += 1
            continue
        try:
            trend_service.create_trend(db, code)
        except InvalidCodeError:
            failed.append(code)
            continue
        except Exception:
            # 1銘柄の予期せぬ失敗でバッチ全体を500にしない。
            db.rollback()
            logger.exception("screening register failed for code %s", code)
            failed.append(code)
            continue
        registered.append(code)
    return ScreeningRegisterResponse(
        registered=registered, skipped_count=skipped_count, failed=failed
    )
