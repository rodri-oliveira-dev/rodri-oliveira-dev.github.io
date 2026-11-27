import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("assemble_site", Path(__file__).with_name("assemble-site.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fixture_spec = importlib.util.spec_from_file_location(
    "prepare_web_push_manual_fixture",
    Path(__file__).with_name("prepare-web-push-manual-fixture.py"),
)
fixture_module = importlib.util.module_from_spec(fixture_spec)
fixture_spec.loader.exec_module(fixture_module)
server_spec = importlib.util.spec_from_file_location(
    "serve_test_site",
    Path(__file__).with_name("serve-test-site.py"),
)
server_module = importlib.util.module_from_spec(server_spec)
server_spec.loader.exec_module(server_module)


class AssembleSiteTests(unittest.TestCase):
    def make_source(self, root: Path) -> Path:
        source = root / "source"
        source.mkdir()
        for relative in module.PUBLIC_PATHS:
            path = source / relative
            if relative != ".well-known" and "." in Path(relative).name:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("public", encoding="utf-8")
            else:
                path.mkdir(parents=True, exist_ok=True)
                public_file = "ard.json" if relative == ".well-known" else "index.html"
                (path / public_file).write_text("public", encoding="utf-8")
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
            self.assertTrue((destination / ".well-known/ard.json").is_file())
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

    def test_rejects_symlink_in_public_file_ancestor(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = self.make_source(root)
            external = root / "external-contracts"
            external.mkdir()
            (external / "webmcp-services.v1.json").write_text("private", encoding="utf-8")
            contracts = source / "docs" / "contracts"
            (contracts / "webmcp-services.v1.json").unlink()
            contracts.rmdir()
            try:
                contracts.symlink_to(external, target_is_directory=True)
            except OSError:
                self.skipTest("Symlinks are unavailable")
            with self.assertRaisesRegex(RuntimeError, "symlinks"):
                module.assemble(source, root / "site")

    def test_manual_web_push_fixture_is_mock_only_and_not_public(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / "fixture"
            fixture_module.prepare(destination)
            files = sorted(
                path.relative_to(destination).as_posix()
                for path in destination.rglob("*")
                if path.is_file()
            )
            self.assertEqual(files, sorted(fixture_module.FILES.values()))
            script = (destination / "web-push-manual.mjs").read_text(encoding="utf-8")
            self.assertNotIn("Notification.requestPermission", script)
            self.assertNotIn("PushManager", script)
            self.assertNotIn("fetch(", script)
            self.assertNotIn(".github", module.PUBLIC_PATHS)
            self.assertTrue(server_module.TestSiteHandler.extensions_map[".mjs"].startswith("text/javascript"))

    def test_manual_web_push_fixture_refuses_existing_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(FileExistsError):
                fixture_module.prepare(Path(temporary))


if __name__ == "__main__":
    unittest.main()
