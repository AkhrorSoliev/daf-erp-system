"""Run: python3 .claude/hooks/test_deploy_guard.py"""
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import deploy_guard as g  # noqa: E402


def run(cwd, *args):
    subprocess.run(
        ["git", "-C", cwd, *args],
        check=True,
        capture_output=True,
        env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"},
    )


class Repos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.origin = os.path.join(base, "origin.git")
        self.work = os.path.join(base, "work")
        os.makedirs(self.origin)
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", self.origin], check=True)
        subprocess.run(["git", "clone", "-q", self.origin, self.work], check=True, capture_output=True)
        self.commit("a")
        run(self.work, "push", "-q", "origin", "HEAD:main")
        run(self.work, "branch", "-q", "stale")  # cut before the next main commit
        self.commit("b")
        run(self.work, "push", "-q", "origin", "HEAD:main")

    def tearDown(self):
        self.tmp.cleanup()

    def commit(self, name):
        with open(os.path.join(self.work, name), "w") as f:
            f.write(name)
        run(self.work, "add", name)
        run(self.work, "commit", "-q", "-m", name)

    def test_stale_branch_is_blocked_and_lists_the_missing_commit(self):
        run(self.work, "switch", "-q", "stale")
        problem = g.check(self.work)
        self.assertIsNotNone(problem)
        self.assertIn("1 commit(s)", problem[0])
        self.assertTrue(any(line.strip().endswith(" b") for line in problem))

    def test_main_and_a_branch_containing_main_pass(self):
        self.assertIsNone(g.check(self.work))
        run(self.work, "switch", "-q", "-c", "feature")
        self.commit("c")
        self.assertIsNone(g.check(self.work))

    def test_not_a_repo_or_no_origin_main_answers_nothing(self):
        self.assertIsNone(g.check(self.tmp.name))
        lone = os.path.join(self.tmp.name, "lone")
        os.makedirs(lone)
        subprocess.run(["git", "init", "-q", lone], check=True)
        self.assertIsNone(g.check(lone))

    def test_hook_denies_only_a_deploy_from_a_stale_tree(self):
        run(self.work, "switch", "-q", "stale")
        os.makedirs(os.path.join(self.work, "server"), exist_ok=True)
        for cmd in ("railway up --detach", "cd server && railway up . --path-as-root", "vercel --prod --yes --cwd client"):
            out = g.hook({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": self.work})
            self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "deny", cmd)
        for cmd in ("git status", "railway logs", "vercel ls", "vercel alias ls", "npm run build", "echo railway upgrade"):
            self.assertIsNone(g.hook({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": self.work}), cmd)
        self.assertIsNone(g.hook({"tool_name": "Edit", "tool_input": {"command": "railway up"}, "cwd": self.work}))

    def test_hook_follows_cd_into_another_checkout(self):
        run(self.work, "switch", "-q", "stale")
        elsewhere = os.path.join(self.tmp.name, "other")
        os.makedirs(elsewhere)
        out = g.hook({"tool_name": "Bash", "tool_input": {"command": f"cd {self.work} && railway up"}, "cwd": elsewhere})
        self.assertEqual(out["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_hotfix_override_in_the_command_lets_it_through(self):
        run(self.work, "switch", "-q", "stale")
        out = g.hook({"tool_name": "Bash", "tool_input": {"command": "DEPLOY_ALLOW_BEHIND_MAIN=1 railway up"}, "cwd": self.work})
        self.assertIsNone(out)

    def test_garbage_input_is_ignored(self):
        self.assertIsNone(g.hook({}))
        self.assertIsNone(g.hook({"tool_name": "Bash", "tool_input": None}))


if __name__ == "__main__":
    unittest.main()
