import pytest
from pydantic import ValidationError

from app.domain.congestion import DEFAULT_THRESHOLDS, Thresholds, congestion_level, network_congestion_index
from app.domain.constants import IncidentStatus as S
from app.domain.incident_state_machine import InvalidTransitionError, available_actions, can_transition, is_open, next_status
from app.domain.permissions import can


class TestIncidentStateMachine:
    def test_main_flow(self):
        status = S.NEW
        for action, expected in [("acknowledge", S.ACKNOWLEDGED), ("start", S.IN_PROGRESS), ("resolve", S.RESOLVED)]:
            status = next_status(status, action)
            assert status == expected
        assert not is_open(status)

    def test_cannot_skip_steps(self):
        assert not can_transition(S.NEW, "resolve")
        with pytest.raises(InvalidTransitionError):
            next_status(S.NEW, "resolve")

    def test_unknown_action(self):
        assert not can_transition(S.NEW, "delete")

    @pytest.mark.parametrize(
        ("status", "actions"),
        [
            (S.NEW, ["acknowledge", "falseAlarm"]),
            (S.IN_PROGRESS, ["resolve", "falseAlarm"]),
            (S.RESOLVED, ["reopen"]),
            (S.FALSE_ALARM, ["reopen"]),
        ],
    )
    def test_available_actions(self, status, actions):
        assert available_actions(status) == actions


class TestPermissions:
    def test_viewer_cannot_update_incident(self):
        assert not can("VIEWER", "incident:update")
        assert can("OPERATOR", "incident:update")

    def test_only_admin_edits_settings(self):
        assert can("ADMIN", "settings:edit")
        assert not can("OPERATOR", "settings:edit")

    def test_unknown_role_or_permission_denied(self):
        assert not can(None, "dashboard:view")
        assert not can("ADMIN", "khong:ton:tai")


class TestCongestion:
    @pytest.mark.parametrize(
        ("speed", "occ", "level"),
        [(45, 0.2, 0), (25, 0.3, 1), (15, 0.5, 2), (40, 0.8, 2), (6, 0.9, 3)],
    )
    def test_levels(self, speed, occ, level):
        assert congestion_level(speed, occ) == level

    def test_network_index_weighted_by_flow(self):
        assert network_congestion_index([]) == 0
        assert network_congestion_index([(3, 100), (0, 100)]) == 50
        assert network_congestion_index([(3, 300), (0, 100)]) == 75

    def test_thresholds_must_be_ordered(self):
        assert DEFAULT_THRESHOLDS.jamSpeed < DEFAULT_THRESHOLDS.slowSpeed
        with pytest.raises(ValidationError):
            Thresholds(jamSpeed=25, slowSpeed=20, busySpeed=30)
        with pytest.raises(ValidationError):
            Thresholds(highOccupancy=1.5)
