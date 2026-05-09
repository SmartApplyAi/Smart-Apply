import { Link } from 'react-router-dom';
import { Globe, Mail, ExternalLink, Link2 } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="landing-footer" id="contact">
      <div className="landing-footer__inner">
        <div className="landing-footer__top">
          {/* Brand */}
          <div className="landing-footer__brand">
            <a href="#" className="landing-footer__logo">
              <span className="landing-footer__logo-dot" />
              Smart<span className="landing-footer__logo-accent">Apply</span>
            </a>
            <p className="landing-footer__tagline">
              AI-powered job application automation. Apply smarter, land faster.
            </p>
          </div>

          {/* Link Groups */}
          <div className="landing-footer__links-group">
            <div className="landing-footer__col">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How it Works</a></li>
                <li><Link to="/signup">Pricing</Link></li>
                <li><a href="#faq">FAQ</a></li>
              </ul>
            </div>
            <div className="landing-footer__col">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Blog</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Contact</a></li>
              </ul>
            </div>
            <div className="landing-footer__col">
              <h4>Legal</h4>
              <ul>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
                <li><a href="#">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="landing-footer__bottom">
          <div className="landing-footer__copy">
            © {new Date().getFullYear()} SmartApply. All rights reserved.
          </div>
          <div className="landing-footer__socials">
            <a href="#" className="landing-footer__social" aria-label="Website">
              <Globe size={16} />
            </a>
            <a href="#" className="landing-footer__social" aria-label="LinkedIn">
              <ExternalLink size={16} />
            </a>
            <a href="#" className="landing-footer__social" aria-label="Community">
              <Link2 size={16} />
            </a>
            <a href="mailto:contact@smartapply.ai" className="landing-footer__social" aria-label="Email">
              <Mail size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
