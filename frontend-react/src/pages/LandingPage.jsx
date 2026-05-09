import AmbientBackground from '../components/effects/AmbientBackground';
import Navbar from '../components/layout/Navbar';
import HeroSection from '../components/hero/HeroSection';

import FeaturesSection from '../components/features/FeaturesSection';
import HowItWorks from '../components/howitworks/HowItWorks';
import LogoMarquee from '../components/marquee/LogoMarquee';
import FAQSection from '../components/faq/FAQSection';
import ContactSection from '../components/contact/ContactSection';
import CTASection from '../components/cta/CTASection';
import Footer from '../components/layout/Footer';

import '../styles/globals.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <AmbientBackground />
      <Navbar />
      <HeroSection />

      <FeaturesSection />
      <HowItWorks />
      <LogoMarquee />
      <FAQSection />
      <ContactSection />
      <CTASection />
      <Footer />
    </div>
  );
}
