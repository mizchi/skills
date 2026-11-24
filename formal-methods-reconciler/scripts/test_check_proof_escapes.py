"""Tests for check_proof_escapes.py. Run: python3 formal-methods-reconciler/scripts/test_check_proof_escapes.py"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("check_proof_escapes.py")


def run(files):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for rel, text in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        proc = subprocess.run([sys.executable, str(SCRIPT), str(root)], capture_output=True, text=True)
        return proc.returncode, proc.stdout + proc.stderr


class Clean(unittest.TestCase):
    def test_proved_lean_theorem_passes(self):
        code, out = run({"Proof.lean": "theorem add_zero' (n : Nat) : n + 0 = n := by\n  simp\n"})
        self.assertEqual(code, 0, out)

    def test_words_inside_comments_and_strings_do_not_count(self):
        files = {
            "Proof.lean": "-- we never use sorry here\n/- an axiom-free proof -/\ndef msg := \"sorry\"\ntheorem t : True := trivial\n",
            "Spec.v": "(* Admitted is forbidden in this file *)\nLemma l : True. Proof. exact I. Qed.\n",
        }
        code, out = run(files)
        self.assertEqual(code, 0, out)

    def test_identifier_containing_keyword_passes(self):
        code, out = run({"A.lean": "def sorryCount := 0\ntheorem axiomatic_ok : True := trivial\n"})
        self.assertEqual(code, 0, out)

    def test_allow_comment_with_reason_passes(self):
        code, out = run({"A.lean": "axiom choice_ok : True  -- fm-escape: allow classical choice, reviewed\n"})
        self.assertEqual(code, 0, out)

    def test_unrelated_files_are_ignored(self):
        code, out = run({"notes.md": "Use `sorry` to skip a proof.\n", "x.py": "assume = True\n"})
        self.assertEqual(code, 0, out)


class Escapes(unittest.TestCase):
    def assertFinding(self, files, needle):
        code, out = run(files)
        self.assertEqual(code, 1, out)
        self.assertIn(needle, out)

    def test_lean_sorry(self):
        self.assertFinding({"P.lean": "theorem t (n : Nat) : n = n + 0 := by\n  sorry\n"}, "P.lean:2")

    def test_lean_axiom(self):
        self.assertFinding({"P.lean": "axiom parser_total : ∀ s, True\n"}, "axiom")

    def test_lean_admit(self):
        self.assertFinding({"P.lean": "example : True := by admit\n"}, "admit")

    def test_rocq_admitted(self):
        self.assertFinding({"S.v": "Lemma l : False.\nProof.\nAdmitted.\n"}, "Admitted")

    def test_rocq_axiom_and_parameter(self):
        self.assertFinding({"S.v": "Axiom ext : forall A, A.\n"}, "Axiom")

    def test_isabelle_sorry_and_axiomatization(self):
        self.assertFinding({"T.thy": "lemma x: \"False\"\n  sorry\n"}, "sorry")
        self.assertFinding({"T.thy": "axiomatization where bad: \"False\"\n"}, "axiomatization")

    def test_dafny_assume_and_axiom_attribute(self):
        self.assertFinding({"m.dfy": "method M() { assume false; }\n"}, "assume")
        self.assertFinding({"m.dfy": "lemma {:axiom} L() ensures false\n"}, "{:axiom}")

    def test_verus_assume_and_external_body(self):
        self.assertFinding({"src/lib.rs": "verus! { proof fn p() { assume(false); } }\n"}, "assume")
        self.assertFinding({"src/lib.rs": "#[verifier::external_body]\nfn f() {}\n"}, "external_body")

    def test_allow_comment_without_reason_still_fails(self):
        self.assertFinding({"P.lean": "axiom a : True  -- fm-escape: allow\n"}, "axiom")


if __name__ == "__main__":
    unittest.main()
