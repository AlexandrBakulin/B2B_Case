import math


def confidence_from_similarity(similarity: float, margin: float = 0.0) -> float:
    """Калиброванная оценка близости для интерфейса, не юридическая вероятность."""
    value = 1 / (1 + math.exp(-((similarity - 0.46) / 0.075)))
    margin_bonus = min(max(margin, 0.0) * 0.35, 0.04)
    return round(min(0.999, max(0.01, value + margin_bonus)) * 100, 1)
