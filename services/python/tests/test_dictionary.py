from app.dictionaries import score_documents


def test_lmd_counts_positive_and_negative():
    docs = [
        ("d1", "Our growth was strong and profitable this year with great improvement."),
        ("d2", "The losses were severe; the decline was disappointing and poor."),
        ("d3", "Nothing happening here."),
    ]
    out = score_documents(method="lmd", documents=docs, user_dictionary=None)
    scores = {s["id"]: s for s in out["scores"]}
    assert scores["d1"]["categoryCounts"]["positive"] > scores["d1"]["categoryCounts"]["negative"]
    assert scores["d2"]["categoryCounts"]["negative"] > scores["d2"]["categoryCounts"]["positive"]
    assert scores["d1"]["score"] is not None and scores["d1"]["score"] > 0
    assert scores["d2"]["score"] is not None and scores["d2"]["score"] < 0
    assert scores["d3"]["score"] == 0


def test_custom_dictionary():
    docs = [("d1", "Brand equity drove margin expansion and customer delight.")]
    out = score_documents(
        method="custom_dict",
        documents=docs,
        user_dictionary={"brand": ["brand", "margin"], "customer": ["customer", "delight"]},
    )
    counts = out["scores"][0]["categoryCounts"]
    assert counts["brand"] == 2
    assert counts["customer"] == 2
