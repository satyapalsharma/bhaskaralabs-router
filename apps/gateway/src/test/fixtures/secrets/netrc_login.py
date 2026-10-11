"""Resolve relay credentials: explicit arguments, then the environment, then
~/.netrc, then an interactive prompt. Nothing here contains a credential; the
module only moves them around."""

from __future__ import annotations

import getpass
import netrc
import os
import sys
from dataclasses import dataclass
from typing import Optional, TextIO


class CredentialError(RuntimeError):
    pass


@dataclass(frozen=True)
class Credentials:
    username: str
    password: str
    account: Optional[str] = None

    def basic_auth(self) -> tuple[str, str]:
        return (self.username, self.password)


def from_environment() -> Optional[Credentials]:
    username = os.environ.get("RELAY_USERNAME")
    password = os.environ.get("RELAY_PASSWORD")
    if not username or not password:
        return None
    return Credentials(username=username, password=password)


def from_netrc(host: str, path: Optional[str] = None) -> Optional[Credentials]:
    try:
        netrc_file = netrc.netrc(path)
    except (FileNotFoundError, netrc.NetrcParseError):
        return None
    auth_from_netrc = netrc_file.authenticators(host)
    if auth_from_netrc is None:
        return None
    login, account, password = auth_from_netrc
    if not login or not password:
        return None
    return Credentials(username=login, password=password, account=account or None)


def prompt_password(prompt: str = "Relay password: ", stream: Optional[TextIO] = None) -> str:
    stream = stream or sys.stderr
    if not sys.stdin.isatty():
        raise CredentialError("no credentials configured and stdin is not a terminal")
    passwd = getpass.getpass(prompt, stream)
    if passwd:
        stream.write("\n")
    return passwd


def resolve(
    host: str,
    username: Optional[str] = None,
    password: Optional[str] = None,
    interactive: bool = True,
) -> Credentials:
    if username and password:
        return Credentials(username=username, password=password)
    found = from_environment() or from_netrc(host)
    if found is not None:
        return found
    if not interactive or not username:
        raise CredentialError(f"no credentials for {host}")
    prompted_password = prompt_password(f"Password for {username}@{host}: ")
    return Credentials(username=username, password=prompted_password)


if __name__ == "__main__":
    creds = resolve(sys.argv[1] if len(sys.argv) > 1 else "relay.example.test", interactive=False)
    print(creds.username)
