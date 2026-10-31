import threading
from collections.abc import Iterable

import numpy as np
from sentence_transformers import SentenceTransformer

from .config import get_settings


class EmbeddingService:
    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None
        self._lock = threading.Lock()

    def load(self) -> None:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = SentenceTransformer(get_settings().model_name, device="cpu")
                    self._model.eval()

    @property
    def ready(self) -> bool:
        return self._model is not None

    def encode(self, texts: str | Iterable[str]) -> np.ndarray:
        self.load()
        single = isinstance(texts, str)
        values = [texts] if single else list(texts)
        vectors = self._model.encode(  # type: ignore[union-attr]
            values,
            batch_size=32,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return vectors[0] if single else vectors


embedder = EmbeddingService()
