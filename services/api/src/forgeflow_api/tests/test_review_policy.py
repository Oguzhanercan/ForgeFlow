from forgeflow_api.domain.review import ReviewPolicyEngine


def test_review_policy_blocks_manual_runs_for_user_confirmation():
    engine = ReviewPolicyEngine()

    decision = engine.resolve(review_mode="manual", stage="review_images")

    assert decision.status == "awaiting_manual_review"
    assert decision.requires_user_action is True


def test_review_policy_auto_mode_generates_reviewer_stage():
    engine = ReviewPolicyEngine()

    decision = engine.resolve(review_mode="automatic_vlm", stage="review_3d")

    assert decision.status == "auto_review_pending"
    assert decision.reviewer_type == "vision_review"

