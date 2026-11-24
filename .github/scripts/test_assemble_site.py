import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("assemble_site", Path(__file__).with_name("assemble-site.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AssembleSiteTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        source.mkdir()
        for relative in module.PUBLIC_PATHS:
            path = source / relative
            if "." in Path(relative).name:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("public", encoding="utf-8")
            else:
                path.mkdir(parents=True, exist_ok=True)
                (path / "index.html").write_text("public", encoding="utf-8")
        for relative in module.PUBLIC_DOCS:
            path = source / "docs" / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("public", encoding="utf-8")
        (source / "backend").mkdir()
        (source / "backend" / "secret.txt").write_text("private", encoding="utf-8")
        return source

    def test_copies_allowlist_and_excludes_repository_internals(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.make_source(root)
            destination = root / "site"
            module.assemble(source, destination)
            self.assertTrue((destination / "index.html").is_file())
            self.assertTrue((destination / "docs/contracts/webmcp-services.v1.json").is_file())
            self.assertFalse((destination / "backend").exists())

    def test_rejects_symlink_in_public_tree(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.make_source(root)
            try:
                (source / "assets" / "link").symlink_to(source / "index.html")
            except OSError:
                self.skipTest("Symlinks are unavailable")
            with self.assertRaisesRegex(RuntimeError, "symlinks"):
                module.assemble(source, root / "site")


if __name__ == "__main__":
    unittest.main()
