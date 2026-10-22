from app import trend_service


def test_create_and_list_trend_groups(client):
    create_response = client.post("/trend-groups", json={"name": "成長株"})
    assert create_response.status_code == 201

    list_response = client.get("/trend-groups")
    assert list_response.status_code == 200
    assert [g["name"] for g in list_response.json()] == ["成長株"]


def test_delete_trend_group_removes_from_active_list(client):
    create_response = client.post("/trend-groups", json={"name": "成長株"})
    group_id = create_response.json()["id"]

    delete_response = client.delete(f"/trend-groups/{group_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}

    list_response = client.get("/trend-groups")
    assert list_response.json() == []


def test_delete_trend_group_not_found_returns_404(client):
    response = client.delete("/trend-groups/9999")

    assert response.status_code == 404


def test_create_trend_group_rejects_name_over_100_chars(client):
    response = client.post("/trend-groups", json={"name": "あ" * 101})

    assert response.status_code == 422


def test_create_trend_group_rejects_empty_name(client):
    response = client.post("/trend-groups", json={"name": ""})

    assert response.status_code == 422
