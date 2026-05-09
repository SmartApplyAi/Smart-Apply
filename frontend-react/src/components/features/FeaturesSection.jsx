import { Bot, FileText, SlidersHorizontal, LayoutDashboard } from 'lucide-react';
import SectionHeading from '../ui/SectionHeading';
import FeatureCard from './FeatureCard';
import './FeaturesSection.css';

const FEATURES = [
  {
    icon: <Bot size={22} />,
    title: 'AI Job Matching',
    description: 'Our AI analyzes job descriptions against your profile to find the best matches, filtering out irrelevant positions automatically.',
  },
  {
    icon: <FileText size={22} />,
    title: 'One-Click Apply',
    description: 'The Chrome extension navigates LinkedIn, finds Easy Apply jobs, and fills every form field using your saved resume and AI answers.',
  },
  {
    icon: <SlidersHorizontal size={22} />,
    title: 'Resume Optimization',
    description: 'Scan your resume against job descriptions with our ATS analyzer. Get keyword scores and actionable improvement suggestions.',
  },
  {
    icon: <LayoutDashboard size={22} />,
    title: 'Smart Tracking Dashboard',
    description: 'Never lose track of applications. Every submission is logged with status updates, links, and detailed analytics.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="features" id="features">
      <SectionHeading
        label="Features"
        title="Everything you need to land your next job"
        description="SmartApply handles the repetitive work while you focus on interview prep and career growth."
      />
      <div className="features__grid">
        {FEATURES.map((f, i) => (
          <FeatureCard
            key={i}
            icon={f.icon}
            title={f.title}
            description={f.description}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
