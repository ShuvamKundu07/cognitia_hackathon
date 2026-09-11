"""Unit tests for Gene conversational assistant."""

import pytest
from app.assistant.conversation import ConversationManager
from app.assistant.reference_resolution import ReferenceResolver
from app.assistant.scene_memory import SceneMemory
from app.hazards.models import (
    BoundingBox,
    DetectedObject,
    Direction,
    HazardAlert,
    MotionType,
    TrackedHazard,
    UrgencyLevel,
)
from app.safety.controller import SafetyController


@pytest.mark.asyncio
async def test_gene_wake_word_activation():
    memory = SceneMemory()
    cm = ConversationManager(scene_memory=memory)

    assert cm.state == "IDLE"
    reply = cm.handle_wake_word()
    assert reply == "Yes, how can I help you?"
    assert cm.state == "ACTIVATING"

    # Also test handling "Hey Bro" via handle_query
    cm.state = "IDLE"
    reply2, _ = await cm.handle_query("Hey Bro", current_frame=None, active_hazards=[])
    assert reply2 == "Yes, how can I help you?"
    assert cm.state == "ACTIVATING"


@pytest.mark.asyncio
async def test_gene_in_front_queries():
    resolver = ReferenceResolver()
    memory = SceneMemory()

    # Case 1: Corridor is clear
    res_clear = resolver.resolve_reference(
        query="Is there anything in front of me?",
        scene_memory=memory,
        active_hazards=[],
    )
    assert res_clear["intent"] == "QUERY_PATH"
    assert res_clear["resolved"] is True
    assert "nothing directly in front of you" in res_clear["response"]

    # Case 2: Hazard directly in walking corridor
    pothole = TrackedHazard(
        hazard_id="pothole_1",
        track_id="1",
        hazard_type="pothole",
        label="pothole",
        direction=Direction.AHEAD,
        path_intersection_score=0.85,
        risk_score=0.75,
        urgency=UrgencyLevel.HIGH,
    )
    res_hazard = resolver.resolve_reference(
        query="What's in front of me?",
        scene_memory=memory,
        active_hazards=[pothole],
    )
    assert res_hazard["intent"] == "QUERY_PATH"
    assert res_hazard["resolved"] is True
    assert "pothole" in res_hazard["response"]


@pytest.mark.asyncio
async def test_gene_multiturn_where_is_it():
    memory = SceneMemory()
    cm = ConversationManager(scene_memory=memory)

    car = TrackedHazard(
        hazard_id="vehicle_99",
        track_id="99",
        hazard_type="vehicle",
        label="car",
        direction=Direction.RIGHT,
        motion=MotionType.APPROACHING,
        risk_score=0.8,
        urgency=UrgencyLevel.HIGH,
    )

    # Turn 1: User asks about car
    reply1, _ = await cm.handle_query(
        query="What is that car doing?",
        current_frame=None,
        active_hazards=[car],
    )
    assert "vehicle on your right" in reply1
    assert cm.last_target_id == "vehicle_99"

    # Turn 2: User asks "Where is it?"
    reply2, _ = await cm.handle_query(
        query="Where is it?",
        current_frame=None,
        active_hazards=[car],
    )
    assert "right" in reply2
    assert "approaching" in reply2


@pytest.mark.asyncio
async def test_gene_exit_phrases():
    memory = SceneMemory()
    cm = ConversationManager(scene_memory=memory)
    cm.state = "LISTENING"

    for exit_phrase in ["Thank you", "thanks", "that's all", "stop"]:
        reply, _ = await cm.handle_query(
            query=exit_phrase,
            current_frame=None,
            active_hazards=[],
        )
        assert reply == "You're welcome. I'll keep monitoring your surroundings."
        assert cm.state == "IDLE"


def test_safety_controller_preempts_gene():
    memory = SceneMemory()
    cm = ConversationManager(scene_memory=memory)
    controller = SafetyController(conversation_manager=cm)

    # When Gene is SPEAKING
    cm.state = "SPEAKING"
    critical_alert = HazardAlert(
        hazard_id="hazard_fast_car",
        hazard_type="vehicle",
        message="STOP. Car approaching from your right.",
        action="STOP",
        direction="right",
        urgency="critical",
        confidence=0.95,
    )

    arbitrated = controller.arbitrate_alert(critical_alert)
    assert arbitrated.interrupt is True
    assert cm.state == "INTERRUPTED"

    # When Gene is ACTIVATING
    cm.state = "ACTIVATING"
    high_alert = HazardAlert(
        hazard_id="hazard_bike",
        hazard_type="bicycle",
        message="Bicycle approaching from your left.",
        action="CAUTION",
        direction="left",
        urgency="high",
        confidence=0.91,
    )
    arbitrated2 = controller.arbitrate_alert(high_alert)
    assert arbitrated2.interrupt is True
    assert cm.state == "INTERRUPTED"
