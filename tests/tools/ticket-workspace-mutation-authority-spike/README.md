# Ticket workspace mutation-authority spike

This spike tests one narrow hypothesis: every cooperating Windows and WSL caller routes resource
mutations to one WSL coordinator. The coordinator holds a distro-local `flock` across authority
revalidation, the external effect, and durable acknowledgement.

Run from the repository root in WSL. The self-test supplies a disposable coordinator state root and
uses the current distro identity:

```sh
tests/tools/ticket-workspace-mutation-authority-spike/selftest.sh
```

Run the same coordinator from Windows after substituting the configured distro and this checkout's
WSL path:

```powershell
wsl.exe --distribution <distro> --exec bash -lc `
  'cd <wsl-checkout-path> && tests/tools/ticket-workspace-mutation-authority-spike/selftest.sh'
```

The test uses only a disposable `mktemp` directory. It verifies effect-before-ack recovery,
serialized competing processes, stale-operation rejection, replacement-generation protection,
dirty-resource protection, atomic detach recovery, deletion-before-ack recovery, rejection of an
alternate state root, and path-alias lock convergence.

This is not a production lock or adapter. It does not prove safety against non-cooperating external
writers, network filesystems, WSL shutdown during an effect, or Windows-only operation without the
configured coordinator distro.
