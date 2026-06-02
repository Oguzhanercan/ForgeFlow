from forgeflow_api.domain.asset_pack import build_master_catalog


def test_master_catalog_groups_assets_for_ui_and_downloads():
    catalog = build_master_catalog(
        run_id="run_123",
        artifacts=[
            {
                "id": "asset_1",
                "group": "gate_module",
                "kind": "image",
                "title": "Gate Variant A",
                "status": "generated",
                "path": "/tmp/gate-a.png",
            },
            {
                "id": "asset_2",
                "group": "gate_module",
                "kind": "3d",
                "title": "Gate Variant A GLB",
                "status": "generated",
                "path": "/tmp/gate-a.glb",
            },
        ],
    )

    assert catalog["run_id"] == "run_123"
    assert catalog["entry_count"] == 2
    assert catalog["groups"][0]["group"] == "gate_module"
    assert catalog["groups"][0]["items"][1]["kind"] == "3d"
