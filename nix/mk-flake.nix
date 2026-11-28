# `quest.lib.mkFlake`: a repository's per-system flake outputs, with Quest's dev
# shell, formatter, and tree check added, so the repository pins only `nixpkgs`
# and `quest`. treefmt-nix stays an input of Quest's flake, not the repository's.
{
  # Quest's own flake, whose `quest` package the dev shell and check use by default.
  quest,
  treefmt-nix,
}:
{
  # The repository's flake, whose source `checks.quest` validates.
  self,
  # The repository's nixpkgs input.
  nixpkgs,
  # The pinned nixpkgs no longer evaluates on x86_64-darwin; Intel Macs use the release binary.
  systems ? [
    "x86_64-linux"
    "aarch64-linux"
    "aarch64-darwin"
  ],
  overlays ? [ ],
  # A treefmt-nix module, such as `{ programs.rustfmt.enable = true; }`; nixfmt is on unless it turns it off.
  fmt ? { },
  # `{ pkgs, system }` to this system's outputs: `shell`, the arguments of the default dev shell's
  # `pkgs.mkShell`; `quest`, the package to use instead of Quest's; and any outputs, such as `packages`,
  # `checks`, or `apps`, merged with those this adds.
  perSystem ? _: { },
}:
let
  inherit (nixpkgs) lib;
  lock = "${self}/flake.lock";
  flakeHash = builtins.hashString "sha256" (
    builtins.readFile "${self}/flake.nix"
    + lib.optionalString (builtins.pathExists lock) (builtins.readFile lock)
  );
  outputs =
    system:
    let
      pkgs = import nixpkgs { inherit system overlays; };
      own = perSystem { inherit pkgs system; };
      questPackage = own.quest or quest.packages.${system}.quest;
      treefmt =
        (treefmt-nix.lib.evalModule pkgs {
          imports = [ fmt ];
          projectRootFile = "flake.nix";
          programs.nixfmt.enable = lib.mkDefault true;
        }).config.build.wrapper;
      shell = own.shell or { };
    in
    removeAttrs own [
      "quest"
      "shell"
    ]
    // {
      devShells = own.devShells or { } // {
        default = pkgs.mkShell (
          shell
          // {
            packages = [
              questPackage
              treefmt
            ]
            ++ shell.packages or [ ];
            # Names the repository's root, the nearest directory up that holds flake.nix, so `quest run` and
            # `quest fmt` run here without entering the shell again: only when its flake.nix and flake.lock are
            # the ones this shell was built from, so `nix develop ../other` names no checkout.
            shellHook = ''
              QUEST_DEV_SHELL=$PWD
              while [ ! -f "$QUEST_DEV_SHELL/flake.nix" ] && [ "$QUEST_DEV_SHELL" != / ]; do
                QUEST_DEV_SHELL=$(dirname "$QUEST_DEV_SHELL")
              done
              if [ -f "$QUEST_DEV_SHELL/flake.nix" ] && [ "$(
                {
                  cat "$QUEST_DEV_SHELL/flake.nix"
                  [ ! -f "$QUEST_DEV_SHELL/flake.lock" ] || cat "$QUEST_DEV_SHELL/flake.lock"
                } | sha256sum
              )" = "${flakeHash}  -" ]; then
                export QUEST_DEV_SHELL
              else
                unset QUEST_DEV_SHELL
              fi
              # Quest's setup-nix action names mbx's Cargo shim, which must stay ahead of this shell's Cargo.
              if [ -n "''${MBX_CARGO_SHIM_DIR:-}" ]; then
                PATH=$MBX_CARGO_SHIM_DIR:$PATH
              fi
            ''
            + shell.shellHook or "";
          }
        );
      };
      formatter = treefmt;
      checks = {
        quest = pkgs.runCommand "quest-check" { nativeBuildInputs = [ questPackage ]; } ''
          quest --root ${self} check
          touch "$out"
        '';
      }
      // own.checks or { };
    };
  bySystem = lib.genAttrs systems outputs;
  names = lib.unique (lib.concatMap lib.attrNames (lib.attrValues bySystem));
in
# From each system's outputs to each output's systems, as flakes lay them out.
lib.genAttrs names (
  name: lib.mapAttrs (_: each: each.${name}) (lib.filterAttrs (_: each: each ? ${name}) bySystem)
)
