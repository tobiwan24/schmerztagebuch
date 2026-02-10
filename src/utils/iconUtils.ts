import { 
  Save, Heart, Calendar, Star, Sun, Moon, 
  Zap, Coffee, Book, Music, Camera, Smile,
  Activity, Briefcase, Home, Mail, Phone, MapPin,
  Clock, Cloud, Droplet, Wind, Thermometer, Umbrella,
  HeartPulse, Pill, Syringe, Stethoscope, 
  Brain, Eye, Ear, Hand, Footprints,
  User, UserCircle, Baby, BedDouble, AlertCircle,
  CircleDot, Target, Zap as Lightning, Flame,
  TrendingDown, TrendingUp, Minus, Plus
} from 'lucide-react';
import type React from 'react';

export const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'save': Save, 'heart': Heart, 'calendar': Calendar, 'star': Star, 'sun': Sun, 'moon': Moon,
  'zap': Zap, 'coffee': Coffee, 'book': Book, 'music': Music, 'camera': Camera, 'smile': Smile,
  'activity': Activity, 'briefcase': Briefcase, 'home': Home, 'mail': Mail, 'phone': Phone,
  'mappin': MapPin, 'clock': Clock, 'cloud': Cloud, 'droplet': Droplet, 'wind': Wind,
  'thermometer': Thermometer, 'umbrella': Umbrella, 'heartpulse': HeartPulse, 'pill': Pill,
  'syringe': Syringe, 'stethoscope': Stethoscope, 'flame': Flame, 'lightning': Lightning,
  'target': Target, 'circledot': CircleDot, 'trendingup': TrendingUp, 'trendingdown': TrendingDown,
  'alertcircle': AlertCircle, 'minus': Minus, 'plus': Plus, 'brain': Brain, 'eye': Eye,
  'ear': Ear, 'hand': Hand, 'footprints': Footprints, 'user': User, 'usercircle': UserCircle,
  'baby': Baby, 'bed': BedDouble,
};

export const ICON_CATEGORIES = {
  'Schmerz & Symptome': ['heartpulse', 'flame', 'lightning', 'target', 'circledot', 'trendingup', 'trendingdown', 'alertcircle', 'plus', 'minus'],
  'Medizin': ['pill', 'syringe', 'stethoscope', 'thermometer', 'activity'],
  'Körperteile': ['brain', 'eye', 'ear', 'hand', 'footprints', 'user', 'usercircle', 'baby'],
  'Alltag': ['calendar', 'clock', 'bed', 'coffee', 'home', 'book', 'music', 'camera', 'phone'],
  'Stimmung & Wetter': ['smile', 'heart', 'star', 'sun', 'moon', 'cloud', 'droplet', 'wind', 'umbrella'],
  'Sonstiges': ['save', 'zap', 'briefcase', 'mail', 'mappin']
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

// Cache für Icon-Components (Performance-Optimierung)
const iconCache = new Map<string, React.ComponentType<{ size?: number; className?: string }>>();

export function getIconComponent(iconName?: string): React.ComponentType<{ size?: number; className?: string }> {
  const key = iconName || 'book';
  
  // Aus Cache zurückgeben wenn vorhanden
  if (iconCache.has(key)) {
    return iconCache.get(key)!;
  }
  
  // Component holen und cachen
  const component = ICON_MAP[key] || ICON_MAP['book'];
  iconCache.set(key, component);
  
  return component;
}
