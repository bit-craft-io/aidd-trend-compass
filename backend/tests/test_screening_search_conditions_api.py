from app import models


def test_search_creates_condition_and_returns_matched_count(client, db_session_factory=None):
    from app.db import get_db
    from app.main import app

    # Insert a candidate directly through the client's session override.
    session_local = client.session_local
    session = session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    response = client.post("/screening/search", json={"enabled_signals": []})

    assert response.status_code == 200
    body = response.json()
    assert body["matched_count"] == 1
    assert "condition_id" in body


def test_list_conditions_returns_created_condition(client):
    client.post("/screening/search", json={"enabled_signals": ["volume_surge"]})

    response = client.get("/screening/conditions")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_rename_condition_success(client):
    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    response = client.patch(f"/screening/conditions/{condition_id}", json={"name": "出来高重視セット"})

    assert response.status_code == 200
    assert response.json()["name"] == "出来高重視セット"


def test_rename_condition_not_found_returns_404(client):
    response = client.patch("/screening/conditions/9999", json={"name": "x"})

    assert response.status_code == 404


def test_delete_condition_removes_from_list(client):
    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    delete_response = client.delete(f"/screening/conditions/{condition_id}")
    assert delete_response.status_code == 200

    list_response = client.get("/screening/conditions")
    assert list_response.json() == []


def test_search_rejects_unknown_signal_key(client):
    response = client.post("/screening/search", json={"enabled_signals": ["not_a_signal"]})

    assert response.status_code == 400
    assert "not_a_signal" in response.json()["detail"]
    assert client.get("/screening/conditions").json() == []


def test_search_response_and_condition_list_report_enabled_signals(client):
    response = client.post(
        "/screening/search", json={"enabled_signals": ["volume_surge", "high_break"]}
    )
    assert response.status_code == 200

    items = client.get("/screening/conditions").json()

    assert len(items) == 1
    assert sorted(items[0]["enabled_signals"]) == sorted(["volume_surge", "high_break"])


def test_rename_condition_rejects_empty_name(client):
    condition_id = client.post("/screening/search", json={"enabled_signals": []}).json()[
        "condition_id"
    ]

    response = client.patch(f"/screening/conditions/{condition_id}", json={"name": ""})

    assert response.status_code == 422


def test_delete_condition_not_found_returns_404(client):
    response = client.delete("/screening/conditions/9999")

    assert response.status_code == 404


def test_delete_condition_twice_returns_404_second_time(client):
    condition_id = client.post("/screening/search", json={"enabled_signals": []}).json()[
        "condition_id"
    ]

    first = client.delete(f"/screening/conditions/{condition_id}")
    second = client.delete(f"/screening/conditions/{condition_id}")

    assert first.status_code == 200
    assert second.status_code == 404


def test_repeated_search_with_same_signal_set_reuses_condition(client):
    first = client.post(
        "/screening/search", json={"enabled_signals": ["volume_surge", "high_break"]}
    ).json()
    second = client.post(
        "/screening/search", json={"enabled_signals": ["high_break", "volume_surge"]}
    ).json()

    assert second["condition_id"] == first["condition_id"]
    assert len(client.get("/screening/conditions").json()) == 1


def test_repeated_search_does_not_duplicate_cached_results(client):
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    condition_id = client.post("/screening/search", json={"enabled_signals": []}).json()[
        "condition_id"
    ]
    client.post("/screening/search", json={"enabled_signals": []})

    body = client.get(f"/screening/results/{condition_id}").json()
    assert body["total"] == 1
    assert len(body["items"]) == 1


def test_search_after_soft_delete_creates_a_new_condition(client):
    first = client.post("/screening/search", json={"enabled_signals": ["volume_surge"]}).json()
    client.delete(f"/screening/conditions/{first['condition_id']}")

    second = client.post("/screening/search", json={"enabled_signals": ["volume_surge"]}).json()

    assert second["condition_id"] != first["condition_id"]
