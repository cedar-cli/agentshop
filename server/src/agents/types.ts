import type { AgentEvent, NewAgentEvent } from "../protocol/events.js";

export interface AgentHandler {
  readonly id: string;
  handle(event: AgentEvent): Promise<NewAgentEvent[]>;
}
