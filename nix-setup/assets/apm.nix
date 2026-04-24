{ pkgs, version ? "0.8.11" }:

let
  inherit (pkgs) lib stdenv fetchurl autoPatchelfHook makeWrapper;
  system = stdenv.hostPlatform.system;

  sources = {
    "x86_64-linux" = {
      suffix = "linux-x86_64";
      sha256 = "b3f4ee5a933c89b97ce30fb7318d227e2c92060b64abd699a35a7e9c1998fe45";
    };
    "aarch64-linux" = {
      suffix = "linux-arm64";
      sha256 = "c49c5b3cdbbf7abe2a4ac630c2cd5706cd45e1576065449d847e4129efaa17c0";
    };
    "x86_64-darwin" = {
      suffix = "darwin-x86_64";
      sha256 = "1c48afad648781d02dbea5050b78a037a4f243b711b92d08d3f05257edb0aec9";
    };
    "aarch64-darwin" = {
      suffix = "darwin-arm64";
      sha256 = "d4d78cfa110d369601d53b1238e0b17a2772ae1ef0281e67eb4917f3525bc6b4";
    };
  };

  srcInfo = sources.${system} or (throw "apm.nix: unsupported system ${system}");
in
stdenv.mkDerivation {
  pname = "apm";
  inherit version;

  src = fetchurl {
    url = "https://github.com/microsoft/apm/releases/download/v${version}/apm-${srcInfo.suffix}.tar.gz";
    sha256 = srcInfo.sha256;
  };

  sourceRoot = "apm-${srcInfo.suffix}";

  nativeBuildInputs = [ makeWrapper ]
    ++ lib.optionals stdenv.isLinux [ autoPatchelfHook ];

  buildInputs = lib.optionals stdenv.isLinux [
    stdenv.cc.cc.lib
    pkgs.zlib
  ];

  dontConfigure = true;
  dontBuild = true;
  # PyInstaller appends its PKG archive after the Mach-O / ELF binary.
  # strip / patchelf would truncate or corrupt that archive.
  dontStrip = true;
  dontPatchELF = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/libexec/apm $out/bin
    cp -r . $out/libexec/apm/
    chmod +x $out/libexec/apm/apm
    makeWrapper $out/libexec/apm/apm $out/bin/apm
    runHook postInstall
  '';

  meta = with lib; {
    description = "Agent Package Manager (microsoft/apm) — dependency manager for AI agent configuration";
    homepage = "https://github.com/microsoft/apm";
    license = licenses.mit;
    mainProgram = "apm";
    platforms = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    sourceProvenance = [ sourceTypes.binaryNativeCode ];
  };
}
