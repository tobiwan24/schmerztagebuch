// Dashboard-spezifische Types
export type DashboardDataType = 'pain' | 'function';
export type DashboardEventCategory = 'event' | 'doctor';

export interface DashboardConfigState {
  type?: DashboardDataType;
  eventTitle?: string;
  eventCategory?: DashboardEventCategory;
}