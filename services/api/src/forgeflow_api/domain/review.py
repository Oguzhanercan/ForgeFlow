from __future__ import annotations

from forgeflow_api.domain.models import ReviewDecision


class ReviewPolicyEngine:
    def resolve(self, review_mode: str | None, stage: str) -> ReviewDecision:
        if review_mode == "manual":
            return ReviewDecision(status="awaiting_manual_review", requires_user_action=True)
        if review_mode == "automatic_vlm":
            return ReviewDecision(status="auto_review_pending", reviewer_type="vision_review")
        if review_mode == "hybrid":
            return ReviewDecision(
                status="auto_review_pending",
                reviewer_type="vision_review",
                requires_user_action=True,
            )
        return ReviewDecision(status="review_mode_required", requires_user_action=True)

