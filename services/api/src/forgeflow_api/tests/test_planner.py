from forgeflow_api.domain.models import ChatMessage
from forgeflow_api.domain.planner import RequestPlanner


def test_planner_detects_chat_only_greeting_requests():
    planner = RequestPlanner()

    plan = planner.plan("hey")

    assert plan.intent_type == "chat_only"
    assert plan.requested_outputs == []
    assert plan.needs_user_choice is False
    assert plan.stages == ["respond_text", "finalize_reply"]


def test_planner_detects_turkish_chat_questions_as_chat_only():
    planner = RequestPlanner()

    plan = planner.plan("isterim, adın ne")

    assert plan.intent_type == "chat_only"
    assert plan.requested_outputs == []
    assert plan.needs_user_choice is False


def test_planner_marks_review_mode_choice_when_missing_for_image_request():
    planner = RequestPlanner()

    plan = planner.plan("Generate a polished bronze shield concept image.")

    assert plan.intent_type == "single_object_image"
    assert plan.review_mode is None
    assert plan.needs_user_choice is True
    assert "review_images" in plan.stages


def test_planner_detects_turkish_image_requests():
    planner = RequestPlanner()

    plan = planner.plan("fatih sultan mehmetin gemileri karadan yürütürken portresinin resmini üret")

    assert plan.intent_type == "single_object_image"
    assert plan.requested_outputs == ["image"]
    assert "generate_images" in plan.stages


def test_planner_respects_image_only_requests():
    planner = RequestPlanner()

    plan = planner.plan("Create a ceremonial shield object image only with automatic review")

    assert plan.intent_type == "single_object_image"
    assert plan.requested_outputs == ["image"]
    assert "generate_3d" not in plan.stages


def test_planner_detects_asset_pack_requests():
    planner = RequestPlanner()

    plan = planner.plan("Create a complete fortress asset pack for a desert faction with towers, gates, props, and 3d exports.")

    assert plan.intent_type == "asset_pack"
    assert plan.grouping_strategy == "asset_family"
    assert "generate_3d" in plan.stages
    assert plan.system_prompt_profile == "asset_pack"


def test_planner_detects_image_edit_requests_for_selected_artifact():
    planner = RequestPlanner()

    plan = planner.plan(
        "Edit this image to add battle damage and darker bronze shading.",
        review_mode="automatic_vlm",
        request_metadata={
            "selected_asset_id": "asset_source_1",
            "selected_asset_kind": "raw_image",
            "selected_asset_title": "Bronze Shield",
            "selected_asset_group_key": "shield",
        },
    )

    assert plan.intent_type == "single_object_image"
    assert plan.requested_outputs == ["image"]
    assert plan.system_prompt_profile == "image_edit_only"
    assert plan.context["prompt_jobs"][0]["source_asset_id"] == "asset_source_1"
    assert plan.context["prompt_jobs"][0]["source_asset_kind"] == "raw_image"


def test_planner_does_not_treat_single_3d_asset_request_as_asset_pack():
    planner = RequestPlanner()

    plan = planner.plan(
        "Bu görselden 3D asset üret.",
        review_mode="automatic_vlm",
        allow_llm=False,
        request_metadata={
            "selected_asset_id": "asset_source_1",
            "selected_asset_kind": "raw_image",
            "selected_asset_title": "Door",
            "selected_asset_group_key": "door",
        },
    )

    assert plan.intent_type == "single_object_3d"
    assert plan.requested_outputs == ["3d"]
    assert plan.grouping_strategy == "object_identity"
    assert plan.context["prompt_jobs"][0]["source_asset_id"] == "asset_source_1"


def test_planner_treats_turkish_photo_generation_as_single_image_request():
    planner = RequestPlanner()

    plan = planner.plan("fatih sultan mehmetin fotoğrafını üret", allow_llm=False)

    assert plan.intent_type == "single_object_image"
    assert plan.requested_outputs == ["image"]


def test_planner_treats_turkish_sadece_imge_followup_as_image_only_request():
    planner = RequestPlanner()
    session_messages = [
        ChatMessage(session_id="session_1", role="user", content="fatih sultan mehmetin fotoğrafını üret"),
    ]

    plan = planner.plan("sadece imge", allow_llm=False, session_messages=session_messages)

    assert plan.intent_type == "single_object_image"
    assert plan.requested_outputs == ["image"]
