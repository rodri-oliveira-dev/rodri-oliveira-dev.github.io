import hashlib
import importlib.util
import json
import re
import unittest
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "sync_agent_readiness", Path(__file__).with_name("sync-agent-readiness.py")
)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class AgentReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = sync.load_config()
        cls.index = json.loads((ROOT / ".well-known/agent-skills/index.json").read_text(encoding="utf-8"))
        cls.ard = json.loads((ROOT / ".well-known/ard.json").read_text(encoding="utf-8"))
        cls.poppy = json.loads((ROOT / ".well-known/poppy.json").read_text(encoding="utf-8"))
        cls.catalog = json.loads((ROOT / ".well-known/ai-catalog.json").read_text(encoding="utf-8"))

    def test_generated_artifacts_are_deterministic(self):
        for path, expected in sync.build_outputs().items():
            self.assertEqual(path.read_bytes(), expected, path)

    def test_discovery_index_and_digests_match_public_skills(self):
        self.assertEqual(
            self.index["$schema"],
            "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        )
        self.assertEqual(len(self.index["skills"]), 5)
        expected_names = [item["name"] for item in self.config["skills"]]
        self.assertEqual([item["name"] for item in self.index["skills"]], expected_names)
        for entry in self.index["skills"]:
            self.assertEqual(entry["type"], "skill-md")
            self.assertRegex(entry["name"], r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            self.assertTrue(entry["url"].startswith("/.well-known/agent-skills/"))
            artifact = ROOT / entry["url"].lstrip("/")
            digest = "sha256:" + hashlib.sha256(artifact.read_bytes()).hexdigest()
            self.assertEqual(entry["digest"], digest)
            frontmatter = sync.parse_frontmatter(artifact)
            self.assertEqual(frontmatter["name"], entry["name"])
            self.assertEqual(frontmatter["description"], entry["description"])
            self.assertNotIn("scripts/", artifact.read_text(encoding="utf-8"))

    def test_skill_page_references_exist_and_cover_all_locales(self):
        origin = self.config["canonical_origin"]
        for entry in self.index["skills"]:
            artifact = ROOT / entry["url"].lstrip("/")
            text = artifact.read_text(encoding="utf-8")
            self.assertIn("pt-BR", text)
            self.assertIn("en:", text)
            self.assertIn("es-419", text)
            paths = re.findall(r"\]\((/[^)\s]*)\)", text)
            self.assertEqual(len(paths), 3)
            for path in paths:
                url = origin + path
                parsed = urlparse(url)
                relative = parsed.path.lstrip("/")
                page = ROOT / relative / "index.html" if relative else ROOT / "index.html"
                self.assertTrue(page.is_file(), url)
                if parsed.fragment:
                    self.assertIn(f'id="{parsed.fragment}"', page.read_text(encoding="utf-8"))

    def test_ard_v091_manifest_matches_index(self):
        entries = self.ard["entries"]
        self.assertEqual(len(entries), 5)
        self.assertEqual(set(self.ard), {"entries"})
        by_name = {entry["name"]: entry for entry in self.index["skills"]}
        identifiers = set()
        for entry in entries:
            self.assertEqual(entry["@context"], "https://agenticresourcediscovery.org/context/v1")
            self.assertRegex(entry["identifier"], r"^urn:air:rodri-oliveira-dev\.github\.io:skill:[a-z0-9-]+$")
            self.assertNotIn(entry["identifier"], identifiers)
            identifiers.add(entry["identifier"])
            self.assertEqual(entry["type"], "application/agent-skills+md")
            self.assertEqual(urlparse(entry["url"]).scheme, "https")
            self.assertGreaterEqual(len(entry["representativeQueries"]), 2)
            self.assertLessEqual(len(entry["representativeQueries"]), 5)
            name = entry["identifier"].rsplit(":", 1)[1]
            self.assertEqual(entry["url"], self.config["canonical_origin"] + by_name[name]["url"])
            self.assertEqual(entry["description"], by_name[name]["description"])

    def test_ai_catalog_v1_is_compatible_projection_of_ard(self):
        self.assertEqual(set(self.catalog), {"specVersion", "host", "entries"})
        self.assertEqual(self.catalog["specVersion"], "1.0")
        identity = self.config["identity"]
        origin = self.config["canonical_origin"]
        self.assertEqual(
            self.catalog["host"],
            {"displayName": identity["name"], "logoUrl": origin + identity["logo_path"]},
        )
        expected = [
            {key: value for key, value in entry.items() if key != "@context"}
            for entry in self.ard["entries"]
        ]
        self.assertEqual(self.catalog["entries"], expected)
        self.assertEqual(len(self.catalog["entries"]), 5)
        self.assertEqual(len({entry["identifier"] for entry in expected}), 5)
        for entry in self.catalog["entries"]:
            self.assertEqual(
                set(entry),
                {"identifier", "displayName", "type", "url", "description",
                 "representativeQueries", "capabilities"},
            )
            self.assertNotIn("data", entry)
            self.assertEqual(entry["type"], "application/agent-skills+md")
            parsed = urlparse(entry["url"])
            self.assertEqual(f"{parsed.scheme}://{parsed.netloc}", origin)
            self.assertTrue(parsed.path.startswith("/.well-known/agent-skills/"))
            self.assertTrue((ROOT / parsed.path.lstrip("/")).is_file())
            self.assertGreaterEqual(len(entry["representativeQueries"]), 2)
            self.assertLessEqual(len(entry["representativeQueries"]), 5)
        self.assertNotIn(self.config["planned_origin"], json.dumps(self.catalog))

    def test_poppy_v1_is_website_only(self):
        self.assertEqual(self.poppy["protocol_version"], "1.0")
        self.assertEqual(self.poppy["organization"]["domain"], self.config["identity"]["domain"])
        self.assertEqual(self.poppy["web"], {})
        self.assertEqual(set(self.poppy), {"protocol_version", "organization", "web"})
        self.assertEqual(urlparse(self.poppy["organization"]["logo_uri"]).scheme, "https")

    def test_robots_has_exactly_the_approved_policy(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assert_valid_robots(robots)
        policy = "Content-Signal: search=yes, ai-input=yes, ai-train=no"
        self.assertEqual(robots.count("Content-Signal:"), 1)
        self.assertIn(policy, robots.splitlines())
        self.assertIn("Allow: /", robots.splitlines())
        self.assertIn(f"Sitemap: {self.config['canonical_origin']}/sitemap.xml", robots.splitlines())

    def test_robots_rejects_an_empty_user_agent(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        malformed = robots.replace("User-agent: *", "User-agent:")
        with self.assertRaises(AssertionError):
            self.assert_valid_robots(malformed)

    def assert_valid_robots(self, robots):
        directives = [
            line.strip()
            for line in robots.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        self.assertTrue(directives)
        for directive in directives:
            self.assertRegex(directive, r"^[A-Za-z][A-Za-z-]*:\s+\S.*$")
        self.assertIn("User-agent: *", directives)

    def test_pages_upload_includes_hidden_agent_contracts(self):
        workflow = (ROOT / ".github/workflows/deploy-pages.yml").read_text(encoding="utf-8")
        upload = workflow.split("actions/upload-pages-artifact@", 1)[1].split("\n\n", 1)[0]
        self.assertIn("path: ${{ runner.temp }}/pages-site", upload)
        self.assertIn("include-hidden-files: true", upload)

    def test_lighthouse_delegates_only_the_incompatible_robots_audit(self):
        config = (ROOT / "lighthouserc.cjs").read_text(encoding="utf-8")
        workflow = (ROOT / ".github/workflows/site-validation.yml").read_text(encoding="utf-8")
        self.assertIn('skipAudits: ["robots-txt"]', config)
        self.assertEqual(config.count("skipAudits:"), 1)
        self.assertIn('"categories:seo": ["error", { minScore: 0.95', config)
        self.assertIn("test_agent_readiness.py", workflow)

    def test_operational_skills_are_not_published(self):
        serialized = json.dumps(self.index) + json.dumps(self.ard) + json.dumps(self.catalog)
        self.assertNotIn(".agents/skills", serialized)
        self.assertNotIn(".github/skills", serialized)


if __name__ == "__main__":
    unittest.main()
