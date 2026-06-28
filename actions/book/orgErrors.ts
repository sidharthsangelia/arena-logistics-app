export class NoActiveOrgError extends Error {
  constructor() {
    super("No active Org for the current session.");
    this.name = "NoActiveOrgError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "UnauthenticatedError";
  }
}