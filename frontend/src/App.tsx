import { Faq } from './components/landing/Faq'
import { Features, WhyIron } from './components/landing/Features'
import { FinalCta, Footer } from './components/landing/Footer'
import { Header } from './components/landing/Header'
import { Hero } from './components/landing/Hero'
import { Reminder } from './components/landing/Reminder'
import { Showcase } from './components/landing/Showcase'
import { Steps } from './components/landing/Steps'

function App() {
  return (
    <div className="overflow-x-clip bg-[#fffffe]">
      <div className="bg-gradient-to-b from-[#fffffe] via-[#fffff2] to-[#fffff0]">
        <Header />
        <Hero />
        <Showcase />
      </div>
      <div className="bg-gradient-to-b from-[#fffff0] via-[#f8fbf6] to-[#f4fafa] pb-[2px]">
        <Features />
        <WhyIron />
        <div className="h-20 lg:h-[160px]" />
      </div>
      <div className="bg-gradient-to-b from-[#f4fafa] to-[#f0f8fe]">
        <Reminder />
      </div>
      <Steps />
      <div className="bg-gradient-to-b from-[#f5fafa] to-[#fefff0]">
        <Faq />
      </div>
      <FinalCta />
      <div className="bg-[#fffff0]">
        <Footer />
      </div>
    </div>
  )
}

export default App
