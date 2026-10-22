from app import trend_group_service


def test_create_group(db_session):
    group = trend_group_service.create_group(db_session, "成長株")

    assert group.id is not None
    assert group.name == "成長株"
    assert group.deleted_at is None


def test_list_active_groups_excludes_soft_deleted(db_session):
    trend_group_service.create_group(db_session, "成長株")
    to_delete = trend_group_service.create_group(db_session, "配当株")
    trend_group_service.soft_delete_group(db_session, to_delete.id)

    active = trend_group_service.list_active_groups(db_session)

    assert [g.name for g in active] == ["成長株"]


def test_soft_delete_group_returns_false_when_not_found(db_session):
    assert trend_group_service.soft_delete_group(db_session, 9999) is False


def test_soft_delete_group_returns_true_and_sets_deleted_at(db_session):
    group = trend_group_service.create_group(db_session, "成長株")

    result = trend_group_service.soft_delete_group(db_session, group.id)

    db_session.refresh(group)
    assert result is True
    assert group.deleted_at is not None
