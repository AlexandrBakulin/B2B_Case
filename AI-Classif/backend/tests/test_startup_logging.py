import ast
import logging
from pathlib import Path


def test_lifespan_logger_is_defined_before_startup():
    source = Path(__file__).parents[1] / "app" / "main.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))

    logger_assignment = next(
        node for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == "logger"
    )
    lifespan = next(
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "lifespan"
    )

    assert logger_assignment.lineno < lifespan.lineno
    assert isinstance(logger_assignment.value, ast.Call)
    assert isinstance(logger_assignment.value.func, ast.Attribute)
    assert logger_assignment.value.func.attr == "getLogger"


def test_startup_logger_is_a_named_logger():
    logger = logging.getLogger("app.main")
    assert isinstance(logger, logging.Logger)
    assert logger.name == "app.main"
